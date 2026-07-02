import { getSupabaseClient } from "@/lib/supabase";

export type AppErrorKind =
  "crash" | "post_fill_failed" | "login_lost" | "facebook_block" | "api_error" | "unhandled";

type ReportInput = {
  kind: AppErrorKind;
  message: string;
  context?: Record<string, unknown>;
};

type AppErrorInsert = {
  user_id: string;
  kind: AppErrorKind;
  message: string;
  context: Record<string, unknown>;
  app_version: string;
  platform: string;
};

type ApiLikeError = {
  message?: string;
  status?: number;
  method?: string;
  endpoint?: string;
  code?: string;
};

type SessionStatusLike = {
  session?: { id?: string; state?: string } | null;
  results?: Array<{
    id?: string;
    groupId?: string;
    status?: string;
    message?: string;
  }>;
  diagnostics?: {
    runnerStatus?: string;
    lastError?: string;
    lastDetectedState?: string;
    blockCooldownUntil?: string | null;
  };
};

const queue: ReportInput[] = [];
const recentFingerprints = new Map<string, number>();
const reportedRunnerEvents = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

const MAX_QUEUE = 40;
const BATCH_SIZE = 10;
const DEDUPE_WINDOW_MS = 30_000;
const MESSAGE_LIMIT = 500;
const CONTEXT_STRING_LIMIT = 240;
const APP_VERSION = String(import.meta.env.VITE_APP_VERSION ?? "0.1.0");

const sensitiveKeyPattern =
  /(post|text|body|html|cookie|token|secret|password|credential|authorization|image|screenshot)/i;

export function reportAppError(kind: AppErrorKind, message: string, context = {}) {
  if (typeof window === "undefined") return;

  const safeMessage = sanitizeMessage(message);
  const safeContext = sanitizeContext({
    route: window.location.pathname,
    ...context,
  });
  const fingerprint = `${kind}:${safeMessage}:${safeContext.route ?? ""}`;
  const now = Date.now();
  const lastSeen = recentFingerprints.get(fingerprint) ?? 0;
  if (now - lastSeen < DEDUPE_WINDOW_MS) return;
  recentFingerprints.set(fingerprint, now);

  queue.push({ kind, message: safeMessage, context: safeContext });
  while (queue.length > MAX_QUEUE) queue.shift();
  scheduleFlush();
}

export function reportApiError(error: ApiLikeError) {
  const method = error.method ?? "API";
  const endpoint = error.endpoint ?? "request";
  reportAppError("api_error", error.code ?? `${method} ${endpoint} failed`, {
    endpoint: error.endpoint,
    method: error.method,
    status: error.status,
    code: error.code,
  });
}

export function installGlobalErrorReporter() {
  if (typeof window === "undefined") return () => {};

  const onError = (event: ErrorEvent) => {
    reportAppError("crash", event.message || "Unhandled browser error.", {
      source: basename(event.filename),
      line: event.lineno,
      column: event.colno,
    });
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    reportAppError("unhandled", messageFromUnknown(event.reason), {
      source: "unhandledrejection",
    });
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

export function reportSessionStatusProblems(status: SessionStatusLike | null | undefined) {
  if (!status?.session?.id) return;

  const sessionId = status.session.id;
  const diagnostics = status.diagnostics;
  const detectedState = diagnostics?.lastDetectedState ?? "";
  const runnerStatus = diagnostics?.runnerStatus ?? "";

  if (runnerStatus === "blocked" || detectedState.startsWith("facebook_block")) {
    const key = `${sessionId}:diagnostic:${detectedState || runnerStatus}`;
    if (!reportedRunnerEvents.has(key)) {
      reportedRunnerEvents.add(key);
      reportAppError("facebook_block", detectedState || "facebook_block", {
        session_id: sessionId,
        session_state: status.session.state,
        runner_status: runnerStatus,
        detected_state: detectedState,
        block_cooldown_until: diagnostics?.blockCooldownUntil ?? null,
      });
    }
  }

  if (detectedState === "daily_limit_reached") {
    const key = `${sessionId}:diagnostic:daily_limit_reached`;
    if (!reportedRunnerEvents.has(key)) {
      reportedRunnerEvents.add(key);
      reportAppError("facebook_block", "daily_limit_reached", {
        session_id: sessionId,
        session_state: status.session.state,
        runner_status: runnerStatus,
        detected_state: detectedState,
      });
    }
  }

  for (const result of status.results ?? []) {
    if (result.status !== "failed" && result.status !== "needs_review") continue;
    const message = result.message || result.status;
    const kind = kindForRunnerMessage(message, result.status);
    if (!kind) continue;
    const key = `${sessionId}:result:${result.id ?? result.groupId ?? message}`;
    if (reportedRunnerEvents.has(key)) continue;
    reportedRunnerEvents.add(key);
    reportAppError(kind, message, {
      session_id: sessionId,
      session_state: status.session.state,
      result_id: result.id,
      result_status: result.status,
      group_id: result.groupId,
      detected_state: detectedState,
    });
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushReports();
  }, 1500);
}

async function flushReports() {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.splice(0, BATCH_SIZE);
  try {
    const client = getSupabaseClient();
    if (!client) return;
    const { data } = await client.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return;

    const rows: AppErrorInsert[] = batch.map((item) => ({
      user_id: userId,
      kind: item.kind,
      message: item.message,
      context: sanitizeContext(item.context ?? {}),
      app_version: APP_VERSION,
      platform: platformLabel(),
    }));

    await client.from("app_errors").insert(rows);
  } catch {
    // Error reporting must never affect the product experience.
  } finally {
    flushing = false;
    if (queue.length > 0) scheduleFlush();
  }
}

function kindForRunnerMessage(message: string, status: string): AppErrorKind | null {
  if (message === "not_logged_in" || message === "security_checkpoint") return "login_lost";
  if (message.startsWith("facebook_block") || message === "daily_limit_reached") {
    return "facebook_block";
  }
  if (
    status === "failed" ||
    message === "composer_not_found" ||
    message === "auto_submit_failed" ||
    message.includes("composer")
  ) {
    return "post_fill_failed";
  }
  return null;
}

function sanitizeContext(input: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (sensitiveKeyPattern.test(key)) continue;
    const safeValue = sanitizeValue(value, 0);
    if (safeValue !== undefined) output[key] = safeValue;
  }
  return output;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value == null) return value;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, CONTEXT_STRING_LIMIT);
  if (depth >= 2) return undefined;
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (sensitiveKeyPattern.test(key)) continue;
      const safeChild = sanitizeValue(child, depth + 1);
      if (safeChild !== undefined) output[key] = safeChild;
    }
    return output;
  }
  return undefined;
}

function sanitizeMessage(message: string) {
  return (message || "Unknown error").slice(0, MESSAGE_LIMIT);
}

function messageFromUnknown(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return "Unhandled promise rejection.";
}

function basename(value: string | undefined) {
  if (!value) return undefined;
  return value.split("/").filter(Boolean).pop();
}

function platformLabel() {
  const nav = typeof navigator === "undefined" ? null : navigator;
  const navWithUserAgentData = nav as
    (Navigator & { userAgentData?: { platform?: string } }) | null;
  return navWithUserAgentData?.userAgentData?.platform ?? nav?.platform ?? "unknown";
}

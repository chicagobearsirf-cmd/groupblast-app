import type {
  AppSettings,
  ChromeProfileDiagnostics,
  ExtensionInfo,
  FacebookGroup,
  FacebookSessionCheckStatus,
  GroupCollection,
  HistoryData,
  ImportFormat,
  ImportPreview,
  ImportProfileSnapshotResponse,
  ImportResult,
  JoinedGroupsSyncStatus,
  PostSession,
  ScheduledPost,
  ScheduledQueueSummary,
  SessionAction,
  SessionStatus,
} from "@/types";

export type ApiHealth = {
  ok: boolean;
  service?: string;
  port?: number;
  time?: string;
};

/** Where the browser is sending API calls. The path is same-origin and the dev
 *  server proxies /api to the local Express API on :3001. */
export const apiInfo = {
  origin: typeof window !== "undefined" ? window.location.origin : "",
  baseUrl: "/api",
  localApiHint: "http://localhost:3001",
};

export class ApiError extends Error {
  status?: number;
  method?: string;
  endpoint?: string;
  suggestion?: string;
  chromeProfileDiagnostics?: ChromeProfileDiagnostics;
}

export type LastApiError = {
  message: string;
  status?: number;
  method?: string;
  endpoint?: string;
  suggestion?: string;
  at: string;
};

// Most-recent API failure, surfaced by the API Health card so users see the exact
// endpoint, status, and reason instead of a generic "request failed".
let lastApiError: LastApiError | null = null;
const lastErrorListeners = new Set<(error: LastApiError | null) => void>();

export const getLastApiError = () => lastApiError;
export const subscribeLastApiError = (listener: (error: LastApiError | null) => void) => {
  lastErrorListeners.add(listener);
  return () => {
    lastErrorListeners.delete(listener);
  };
};
export const clearLastApiError = () => {
  lastApiError = null;
  for (const listener of lastErrorListeners) listener(null);
};
const recordApiError = (error: ApiError) => {
  lastApiError = {
    message: error.message,
    status: error.status,
    method: error.method,
    endpoint: error.endpoint,
    suggestion: error.suggestion,
    at: new Date().toISOString(),
  };
  for (const listener of lastErrorListeners) listener(lastApiError);
};

const suggestionForStatus = (status: number, path: string): string => {
  if (status === 414) {
    return "The request URL was too long (HTTP 414). This means an old browser tab is running a stale build. Hard-refresh the page (Cmd+Shift+R / Ctrl+Shift+R) to load the current app, which sends data in the POST body instead of the URL.";
  }
  if (status === 404) {
    return `No local API route matched ${path}. The local API may be an older version — stop and restart the app with \`npm run dev\`, then hard-refresh the browser.`;
  }
  if (status === 413) {
    return "The uploaded content was too large for the API. Split the import into smaller files.";
  }
  if (status >= 500) {
    return "The local API hit an internal error. Check the API terminal (the `npm run dev` window) for the matching `[api] … -> 500` line and stack trace.";
  }
  return "Review the endpoint and try again. If it used to work, restart `npm run dev` and hard-refresh the browser.";
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options.headers },
    });
  } catch {
    // fetch() only rejects on network/connection failure — the local API is down
    // or unreachable, not an HTTP error status.
    const error = new ApiError(
      `Could not reach the local API (${method} ${path}). The local API is not responding.`,
    );
    error.method = method;
    error.endpoint = path;
    error.suggestion = `Make sure the app was started with \`npm run dev\` so the local API is listening on ${apiInfo.localApiHint}, then retry.`;
    recordApiError(error);
    throw error;
  }
  if (!response.ok) {
    const body = await response.json().catch(
      () =>
        ({}) as {
          error?: string;
          suggestion?: string;
          chromeProfileDiagnostics?: ChromeProfileDiagnostics;
        },
    );
    const error = new ApiError(
      body.error ?? `Request failed: ${method} ${path} → ${response.status} ${response.statusText}`,
    );
    error.status = response.status;
    error.method = method;
    error.endpoint = path;
    error.suggestion = body.suggestion ?? suggestionForStatus(response.status, path);
    error.chromeProfileDiagnostics = body.chromeProfileDiagnostics;
    recordApiError(error);
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown = {}) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });

export type GroupInput = {
  name: string;
  url: string;
  category?: string;
  subcategory?: string;
  tags?: string[];
  notes?: string;
  status?: FacebookGroup["status"];
};

export const api = {
  health: () => request<ApiHealth>("/api/health"),

  groups: () => request<FacebookGroup[]>("/api/groups"),
  saveGroup: (input: GroupInput) => post<FacebookGroup>("/api/groups", input),
  updateGroup: (id: string, input: Partial<GroupInput>) =>
    put<FacebookGroup>(`/api/groups/${id}`, input),
  archiveGroup: (id: string) => request<void>(`/api/groups/${id}`, { method: "DELETE" }),
  deleteGroup: (id: string) => request<void>(`/api/groups/${id}?hard=true`, { method: "DELETE" }),
  bulkCategorize: (groupIds: string[], patch: { category?: string; subcategory?: string }) =>
    post<{ updated: number }>("/api/groups/bulk-categorize", { groupIds, ...patch }),

  collections: () => request<GroupCollection[]>("/api/collections"),
  saveCollection: (input: { name: string; description?: string; groupIds: string[] }) =>
    post<GroupCollection>("/api/collections", input),

  importPreview: (content: string, format: ImportFormat) =>
    post<ImportPreview>("/api/import-groups/preview", { content, format }),
  importGroups: (content: string, format: ImportFormat) =>
    post<ImportResult>("/api/import-groups", { content, format }),
  startJoinedGroupsSync: () =>
    post<JoinedGroupsSyncStatus>("/api/import-groups/joined-facebook-groups/start"),
  joinedGroupsSyncStatus: () =>
    request<JoinedGroupsSyncStatus>("/api/import-groups/joined-facebook-groups/status"),
  stopJoinedGroupsSync: () =>
    post<JoinedGroupsSyncStatus>("/api/import-groups/joined-facebook-groups/stop"),
  confirmJoinedGroupsSyncImport: () =>
    post<ImportResult>("/api/import-groups/joined-facebook-groups/confirm"),

  settings: () => request<AppSettings>("/api/settings"),
  updateSettings: (input: Partial<AppSettings>) => put<AppSettings>("/api/settings", input),

  launchLoginBrowser: () =>
    post<{ settings: AppSettings; chromeProfileDiagnostics: ChromeProfileDiagnostics }>(
      "/api/facebook/launch-login-browser",
    ),
  checkFacebookSession: () =>
    post<{
      status: FacebookSessionCheckStatus;
      settings: AppSettings;
      chromeProfileDiagnostics: ChromeProfileDiagnostics;
    }>("/api/facebook/check-session"),
  testChromeProfile: () =>
    post<{ settings: AppSettings; chromeProfileDiagnostics: ChromeProfileDiagnostics }>(
      "/api/facebook/test-chrome-profile",
    ),
  importProfileSnapshot: () =>
    post<ImportProfileSnapshotResponse>("/api/facebook/import-profile-snapshot"),

  extensionInfo: () => request<ExtensionInfo>("/api/extension/info"),

  createSession: (postText: string, selectedGroupIds: string[]) =>
    post<PostSession>("/api/sessions", { postText, selectedGroupIds }),
  createScheduledPosts: (postText: string, selectedGroupIds: string[], days: number) =>
    post<{ scheduled: ScheduledPost[]; summary: ScheduledQueueSummary }>("/api/scheduled-posts", {
      postText,
      selectedGroupIds,
      days,
    }),
  scheduledPosts: () => request<ScheduledPost[]>("/api/scheduled-posts"),
  scheduledSummary: () => request<ScheduledQueueSummary>("/api/scheduled-posts/summary"),
  cancelScheduledPost: (id: string) =>
    post<{ scheduledPost: ScheduledPost; summary: ScheduledQueueSummary }>(
      `/api/scheduled-posts/${id}/cancel`,
    ),
  cancelAllScheduledPosts: () =>
    post<{ canceled: number; summary: ScheduledQueueSummary }>("/api/scheduled-posts/cancel-all"),
  sessionAction: (sessionId: string, action: SessionAction) =>
    post<SessionStatus>(`/api/sessions/${sessionId}/${action}`),
  forceStop: () => post<SessionStatus>("/api/runner/force-stop"),
  sessionStatus: () => request<SessionStatus>("/api/session-status"),
  history: () => request<HistoryData>("/api/history"),
};

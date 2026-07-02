import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import express from "express";
import {
  extensionDir,
  extensionZipFileName,
  getZipPath,
  listExtensionFiles,
  readExtensionManifest,
} from "./extension-packager";
import { parseImportAuto, parseImportAutoWithDiagnostics } from "./importer";
import { runner } from "./runner";
import { storage } from "./db";

const app = express();
const port = Number(process.env.API_PORT ?? 3001);
const isDev = process.env.NODE_ENV !== "production";
const param = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

app.use(express.json({ limit: "5mb" }));

// Allow the local Vite dev server (port 8080) and the packaged Electron renderer
// to call this API. The auth-callback page runs in the system browser and needs
// this to POST tokens to the session-relay endpoint.
app.use((req, res, next) => {
  const origin = req.headers.origin ?? "";
  if (origin === "http://localhost:8080" || origin === "http://127.0.0.1:8080") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Capture any { error } body so the dev request logger can show a short reason
// without us logging full payloads or Facebook cookies.
app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (body && typeof body === "object" && "error" in body) {
      res.locals.apiError = (body as { error?: unknown }).error;
    }
    return originalJson(body as never);
  }) as typeof res.json;
  next();
});

// Dev-only request logger: method, path, status, duration, and a short error
// message. Never logs request bodies, query strings, headers, or cookies.
// High-frequency polling endpoints only log when they fail, to keep the terminal readable.
const quietWhenOkPaths = new Set([
  "/api/health",
  "/api/session-status",
  "/api/import-groups/joined-facebook-groups/status",
  "/api/joined-facebook-groups/status",
]);
if (isDev) {
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      const quiet = quietWhenOkPaths.has(req.path) && res.statusCode < 400;
      if (quiet) return;
      const ms = Date.now() - startedAt;
      const reason = res.locals.apiError ? ` :: ${String(res.locals.apiError).slice(0, 200)}` : "";
      const line = `[api] ${req.method} ${req.path} -> ${res.statusCode} (${ms}ms)${reason}`;
      if (res.statusCode >= 500) console.error(line);
      else if (res.statusCode >= 400) console.warn(line);
      else console.log(line);
    });
    next();
  });
}

const asyncRoute =
  (handler: express.RequestHandler): express.RequestHandler =>
  (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    service: "facebook-automation-local-api",
    port,
    time: new Date().toISOString(),
  }),
);

// Auth session relay: the magic-link callback page (running in the system
// browser) posts tokens here; the Electron app polls to pick them up.
let pendingSession: { access_token: string; refresh_token: string } | null = null;
let pendingSessionExpiry = 0;

app.post("/api/auth/session-relay", (req, res) => {
  const { access_token, refresh_token } = req.body ?? {};
  if (!access_token || !refresh_token) {
    return res.status(400).json({ error: "access_token and refresh_token required" });
  }
  pendingSession = { access_token, refresh_token };
  pendingSessionExpiry = Date.now() + 10 * 60 * 1000;
  res.json({ ok: true });
});

app.get("/api/auth/session-relay", (_req, res) => {
  if (pendingSession && Date.now() < pendingSessionExpiry) {
    const session = pendingSession;
    pendingSession = null;
    return res.json({ ok: true, session });
  }
  res.json({ ok: true, session: null });
});

// Stable per-machine ID for trial-abuse prevention. Generated once and persisted
// in the app's data dir; reported to check_trial_status so a new account on the
// same machine inherits the original trial clock instead of a fresh trial.
const deviceIdDataDir = process.env.GROUPBLAST_DATA_DIR
  ? resolve(process.env.GROUPBLAST_DATA_DIR)
  : resolve(process.cwd(), "data");
const deviceIdPath = join(deviceIdDataDir, "device-id");

app.get("/api/device-id", (_req, res) => {
  let id = "";
  try {
    id = readFileSync(deviceIdPath, "utf8").trim();
  } catch {
    // first run — no file yet
  }
  if (!id) {
    id = randomUUID();
    try {
      writeFileSync(deviceIdPath, id);
    } catch {
      // read-only fs edge case: fall through with the in-memory id
    }
  }
  res.json({ ok: true, deviceId: id });
});

app.get("/api/groups", (req, res) => {
  res.json(
    storage.listGroups({
      search: String(req.query.search ?? ""),
      category: String(req.query.category ?? ""),
      subcategory: String(req.query.subcategory ?? ""),
      status: String(req.query.status ?? ""),
    }),
  );
});

app.post("/api/groups", (req, res) => res.status(201).json(storage.upsertGroup(req.body)));
app.put("/api/groups/:id", (req, res) =>
  res.json(storage.updateGroup(param(req.params.id), req.body)),
);
app.delete("/api/groups/:id", (req, res) => {
  if (String(req.query.hard ?? "") === "true") {
    storage.deleteGroup(param(req.params.id));
  } else {
    storage.archiveGroup(param(req.params.id));
  }
  res.status(204).end();
});

app.post("/api/groups/bulk-categorize", (req, res) => {
  const { groupIds, category, subcategory } = req.body as {
    groupIds: string[];
    category?: string;
    subcategory?: string;
  };
  const patch: { category?: string; subcategory?: string } = {};
  if (typeof category === "string" && category.trim()) patch.category = category.trim();
  if (typeof subcategory === "string") patch.subcategory = subcategory.trim();
  if (!Object.keys(patch).length) {
    return res.status(400).json({ error: "Provide a category or subcategory to apply." });
  }
  const updated = groupIds.map((groupId) => storage.updateGroup(groupId, patch)).filter(Boolean);
  res.json({ updated: updated.length });
});

// --- Import (preview is read-only; commit writes) ---
// Both the original /api/import-groups* paths and the shorter /api/import* aliases
// are accepted so older and newer clients hit a real route instead of a 404.
const importCommitHandler: express.RequestHandler = (req, res) => {
  const { content, format } = req.body as { content: string; format: "csv" | "json" | "auto" };
  let rows: ReturnType<typeof parseImportAuto>;
  try {
    rows = parseImportAuto(content, format);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Could not parse the import file.",
    });
  }
  const preview = getImportPreview(rows);
  try {
    // Transactional: if any row throws, the whole batch rolls back so we never
    // leave a half-written import that the user sees as "failed".
    storage.upsertGroups(rows);
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Import failed while saving groups.",
      imported: 0,
    });
  }
  res.json({
    imported: rows.length,
    created: preview.newCount,
    updated: preview.updatedCount,
    duplicateCount: preview.duplicateCount,
    skipped: 0,
  });
};
app.post(["/api/import-groups", "/api/import/commit"], importCommitHandler);

const importPreviewHandler: express.RequestHandler = (req, res) => {
  const { content, format } = req.body as { content: string; format: "csv" | "json" | "auto" };
  const { rows, diagnostics } = parseImportAutoWithDiagnostics(content, format);
  res.json({ ...getImportPreview(rows), diagnostics });
};
app.post(["/api/import-groups/preview", "/api/import/preview"], importPreviewHandler);

// --- Joined Facebook groups sync ---
app.post(
  ["/api/import-groups/joined-facebook-groups/start", "/api/joined-facebook-groups/start"],
  asyncRoute(async (_req, res) => {
    res.json(await runner.startJoinedGroupsSync());
  }),
);
app.get(
  ["/api/import-groups/joined-facebook-groups/status", "/api/joined-facebook-groups/status"],
  (_req, res) => res.json(runner.getJoinedGroupsSyncStatus()),
);
app.post(
  ["/api/import-groups/joined-facebook-groups/stop", "/api/joined-facebook-groups/stop"],
  (_req, res) => res.json(runner.stopJoinedGroupsSync()),
);
app.post(
  ["/api/import-groups/joined-facebook-groups/confirm", "/api/joined-facebook-groups/confirm"],
  (_req, res) => {
    const sync = runner.getJoinedGroupsSyncStatus();
    if (sync.state !== "ready" && sync.state !== "stopped") {
      return res.status(400).json({ error: "Run a group sync and review the preview first." });
    }
    const rows = sync.rows.map((row) => ({
      name: row.name,
      url: row.url,
      category: row.category,
      subcategory: row.subcategory,
      tags: row.tags,
      status: row.status,
      notes: row.notes,
      source: row.source,
      sourceCapturedAt: row.capturedAt,
      sourceUpdatedAt: row.updatedAt,
    }));
    const preview = getImportPreview(rows);
    for (const row of rows) storage.upsertGroup(row);
    runner.markJoinedGroupsSyncImported();
    res.json({
      imported: rows.length,
      created: preview.newCount,
      updated: preview.updatedCount,
      duplicateCount: preview.duplicateCount,
      skipped: 0,
    });
  },
);

app.get("/api/categories", (_req, res) => res.json(storage.categories()));
app.get("/api/subcategories", (req, res) =>
  res.json(storage.subcategories(String(req.query.category ?? ""))),
);
app.get("/api/collections", (_req, res) => res.json(storage.collections()));
app.post("/api/collections", (req, res) => res.status(201).json(storage.saveCollection(req.body)));

app.get("/api/settings", (_req, res) => res.json(storage.getSettings()));
app.put("/api/settings", (req, res) => res.json(storage.updateSettings(req.body)));
app.post(
  "/api/facebook/launch-login-browser",
  asyncRoute(async (_req, res) => {
    const result = await runner.launchFacebookLoginBrowser();
    res.json({
      settings: storage.getSettings(),
      diagnostics: result.runnerDiagnostics,
      chromeProfileDiagnostics: result.chromeProfileDiagnostics,
    });
  }),
);
app.post(
  "/api/facebook/check-session",
  asyncRoute(async (_req, res) => {
    const result = await runner.checkFacebookSession();
    res.json({ ...result, settings: storage.getSettings() });
  }),
);
app.post(
  "/api/facebook/test-chrome-profile",
  asyncRoute(async (_req, res) => {
    res.json({
      settings: storage.getSettings(),
      chromeProfileDiagnostics: await runner.testChromeProfilePath(),
    });
  }),
);
app.post(
  "/api/facebook/import-profile-snapshot",
  asyncRoute(async (_req, res) => {
    res.json(await runner.importChromeProfileSnapshot());
  }),
);

app.post("/api/sessions", (req, res) => {
  const { postText, selectedGroupIds } = req.body as {
    postText: string;
    selectedGroupIds: string[];
  };
  if (!postText?.trim()) return res.status(400).json({ error: "Post text is required." });
  if (!selectedGroupIds?.length)
    return res.status(400).json({ error: "Select at least one group." });
  const settings = storage.getSettings();
  if (selectedGroupIds.length > settings.maxGroupsPerSession) {
    return res.status(400).json({
      error: `Selection exceeds max groups per session (${settings.maxGroupsPerSession}).`,
    });
  }
  res.status(201).json(storage.createSession(postText, selectedGroupIds));
});

app.post(
  "/api/sessions/:id/start",
  asyncRoute(async (req, res) => {
    await runner.start(param(req.params.id));
    res.json(await runner.getStatus(param(req.params.id)));
  }),
);
app.post(
  "/api/sessions/:id/pause",
  asyncRoute(async (req, res) => {
    runner.pause();
    res.json(await runner.getStatus(param(req.params.id)));
  }),
);
app.post(
  "/api/sessions/:id/resume",
  asyncRoute(async (req, res) => {
    runner.resume();
    res.json(await runner.getStatus(param(req.params.id)));
  }),
);
app.post(
  "/api/sessions/:id/stop",
  asyncRoute(async (req, res) => {
    runner.stop();
    res.json(await runner.getStatus(param(req.params.id)));
  }),
);
app.post(
  "/api/runner/force-stop",
  asyncRoute(async (_req, res) => {
    res.json(await runner.forceStop());
  }),
);
app.post(
  "/api/sessions/:id/skip",
  asyncRoute(async (req, res) => {
    await runner.mark("skipped", req.body?.message ?? "Skipped by user.");
    res.json(await runner.getStatus(param(req.params.id)));
  }),
);
app.post(
  "/api/sessions/:id/continue-next",
  asyncRoute(async (req, res) => {
    await runner.mark(
      "needs_review",
      req.body?.message ?? "Continued to next group after manual review.",
    );
    res.json(await runner.getStatus(param(req.params.id)));
  }),
);
app.post(
  "/api/sessions/:id/mark-posted",
  asyncRoute(async (req, res) => {
    await runner.mark("posted", req.body?.message ?? "Marked posted after human review.");
    res.json(await runner.getStatus(param(req.params.id)));
  }),
);
app.post(
  "/api/sessions/:id/mark-failed",
  asyncRoute(async (req, res) => {
    await runner.mark("failed", req.body?.message ?? "Marked failed by user.");
    res.json(await runner.getStatus(param(req.params.id)));
  }),
);
app.post(
  "/api/sessions/:id/mark-pending-admin-review",
  asyncRoute(async (req, res) => {
    // User-confirmed: Facebook showed the post is awaiting admin approval.
    // Recorded as needs_review with an evidence-backed reason (see runner.mark).
    await runner.mark("needs_review", req.body?.message ?? "pending_admin_review");
    res.json(await runner.getStatus(param(req.params.id)));
  }),
);
app.post(
  "/api/sessions/:id/retry-current",
  asyncRoute(async (req, res) => {
    await runner.retryCurrent();
    res.json(await runner.getStatus(param(req.params.id)));
  }),
);
app.post(
  "/api/sessions/:id/open-current",
  asyncRoute(async (req, res) => {
    await runner.openCurrent();
    res.json(await runner.getStatus(param(req.params.id)));
  }),
);
app.get(
  "/api/sessions/:id/status",
  asyncRoute(async (req, res) => res.json(await runner.getStatus(param(req.params.id)))),
);
app.get(
  "/api/session-status",
  asyncRoute(async (_req, res) => res.json(await runner.getStatus())),
);
app.get("/api/history", (_req, res) =>
  res.json({ sessions: storage.history(), results: storage.listResults() }),
);

app.get("/api/extension/info", (_req, res) => {
  const files = listExtensionFiles();
  const manifest = readExtensionManifest();
  const zipPath = getZipPath();
  res.json({
    name: manifest.name,
    version: manifest.version,
    manifestVersion: manifest.manifestVersion,
    extensionPath: extensionDir,
    files,
    available: files.includes("manifest.json"),
    zipPath,
    zipExists: existsSync(zipPath),
    zipFileName: extensionZipFileName,
    downloadUrl: "/api/extension/download",
  });
});

app.get("/api/extension/download", (_req, res) => {
  const zipPath = getZipPath();
  if (!existsSync(zipPath)) {
    res.status(404).json({
      error: `ZIP not found at ${zipPath}. Run \`npm run package:extension\` to build it first.`,
    });
    return;
  }
  const zip = readFileSync(zipPath);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${extensionZipFileName}"`);
  res.send(zip);
});

// Lists every route the running API actually exposes, so a 404 can be confirmed
// against reality instead of guessed at. Visit http://localhost:3001/api/debug/routes.
app.get("/api/debug/routes", (_req, res) => {
  const routes = listRegisteredRoutes();
  res.json({ count: routes.length, routes });
});

// Any unmatched /api/* path returns JSON (not the SPA's HTML fallback) so the
// client surfaces a clear "route not found" instead of failing to parse HTML.
// Also lists the Facebook routes that DO exist, since those are the usual suspects.
app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  const available = listRegisteredRoutes()
    .filter((route) => route.path.startsWith("/api/facebook"))
    .map((route) => `${route.methods.join("/")} ${route.path}`);
  res.status(404).json({
    error: `No local API route for ${req.method} ${req.path}.`,
    availableFacebookRoutes: available,
    suggestion:
      "If you are seeing this from a built/deployed/preview app, the local API is not reachable — /api only works under `npm run dev` (Express on http://localhost:3001, proxied at /api on http://localhost:8080). Open the app at http://localhost:8080. To confirm what exists, GET /api/debug/routes.",
  });
});

app.use(
  (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error);
    const chromeProfileDiagnostics =
      error instanceof Error && "chromeProfileDiagnostics" in error
        ? (error as { chromeProfileDiagnostics?: unknown }).chromeProfileDiagnostics
        : undefined;
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected server error.",
      chromeProfileDiagnostics,
    });
  },
);

app.listen(port, "127.0.0.1", () => {
  console.log(`Local Facebook automation API running at http://localhost:${port}`);
  const routes = listRegisteredRoutes();
  console.log(`[api] ${routes.length} routes registered. Facebook routes:`);
  for (const route of routes.filter((r) => r.path.startsWith("/api/facebook"))) {
    console.log(`[api]   ${route.methods.join("/")} ${route.path}`);
  }
});

// Walks the Express router stack to report the method + path of every registered
// route. Handles array-path registrations (e.g. aliases) by expanding each path.
function listRegisteredRoutes(): { methods: string[]; path: string }[] {
  const appWithRouter = app as unknown as {
    router?: { stack?: unknown[] };
    _router?: { stack?: unknown[] };
  };
  // On Express 4 the `router` property is a getter that throws a deprecation
  // error, so read it defensively — this is diagnostic logging and must never
  // crash server startup regardless of the installed Express version.
  let stack: unknown[] = [];
  try {
    stack = appWithRouter.router?.stack ?? appWithRouter._router?.stack ?? [];
  } catch {
    stack = appWithRouter._router?.stack ?? [];
  }
  const routes: { methods: string[]; path: string }[] = [];
  for (const entry of stack) {
    const layer = entry as {
      route?: { path?: string | string[]; methods?: Record<string, boolean> };
    };
    if (!layer.route) continue;
    const methods = Object.entries(layer.route.methods ?? {})
      .filter(([, enabled]) => enabled)
      .map(([method]) => method.toUpperCase());
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path ?? ""];
    for (const path of paths) routes.push({ methods, path: String(path) });
  }
  return routes;
}

function getImportPreview(rows: ReturnType<typeof parseImportAuto>) {
  const existingUrls = new Set(
    storage.listGroups().map((group) => storage.normalizeUrl(group.url)),
  );
  const seenUrls = new Set<string>();
  let duplicateCount = 0;
  let newCount = 0;
  let updatedCount = 0;
  const previewRows = rows.map((row) => {
    const normalizedUrl = storage.normalizeUrl(row.url);
    const duplicateInFile = seenUrls.has(normalizedUrl);
    const exists = existingUrls.has(normalizedUrl);
    seenUrls.add(normalizedUrl);
    if (duplicateInFile || exists) duplicateCount += 1;
    if (exists) updatedCount += 1;
    if (!exists && !duplicateInFile) newCount += 1;
    return { ...row, importAction: exists ? "update" : duplicateInFile ? "duplicate" : "create" };
  });
  return {
    rows: previewRows,
    totalRows: rows.length,
    duplicateCount,
    newCount,
    updatedCount,
  };
}

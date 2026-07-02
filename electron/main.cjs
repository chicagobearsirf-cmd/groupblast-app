const { app, BrowserWindow, shell, dialog, Menu } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

// In a packaged app there is NO system Node.js. We run the API + web servers
// using Electron's OWN bundled Node by setting ELECTRON_RUN_AS_NODE=1 and
// pointing process.execPath at the JS CLI entry directly (not the .bin shims,
// which depend on `#!/usr/bin/env node` finding a system node that isn't there).
const ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "app")
  : path.resolve(__dirname, "..");

const API_PORT = 3001;
const WEB_PORT = 8080;

const TSX_CLI = path.join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const VITE_CLI = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");

// Writable per-user locations (the install dir is read-only when packaged).
const USER_DATA = app.getPath("userData");
const DATA_DIR = path.join(USER_DATA, "data");
const VITE_CACHE_DIR = path.join(USER_DATA, "vite-cache");

let mainWindow = null;
let apiProcess = null;
let webProcess = null;

function log(msg) {
  console.log(`[GroupBlast] ${msg}`);
}

function spawnNode(scriptPath, scriptArgs, extraEnv) {
  return spawn(process.execPath, [scriptPath, ...scriptArgs], {
    cwd: ROOT,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Playwright's Chromium is bundled as an extraResource (pw-browsers) so fresh
// machines don't need to run `playwright install`. Point Playwright at it. In
// dev it falls back to the normal per-user Playwright cache.
const PW_BROWSERS_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "pw-browsers")
  : path.join(ROOT, "pw-browsers");

let quitting = false;
let apiRestartCount = 0;

function startApiServer() {
  apiProcess = spawnNode(TSX_CLI, ["src/local-api/server.ts"], {
    NODE_ENV: "development",
    API_PORT: String(API_PORT),
    GROUPBLAST_DATA_DIR: DATA_DIR,
    PLAYWRIGHT_BROWSERS_PATH: PW_BROWSERS_PATH,
  });
  apiProcess.stdout.on("data", (d) => log(`[api] ${d.toString().trim()}`));
  apiProcess.stderr.on("data", (d) => log(`[api:err] ${d.toString().trim()}`));
  apiProcess.on("exit", (code) => {
    log(`API exited with code ${code}`);
    // If the API crashes while the app is still running (e.g. a Playwright
    // browser crash takes it down), restart it so the UI doesn't get stuck on
    // 502s. Cap restarts to avoid a crash loop burning CPU.
    if (!quitting && apiRestartCount < 5) {
      apiRestartCount += 1;
      log(`Restarting API (attempt ${apiRestartCount}/5)...`);
      setTimeout(startApiServer, 2000);
    }
  });
}

function startWebServer() {
  webProcess = spawnNode(VITE_CLI, ["dev", "--port", String(WEB_PORT), "--strictPort", "--host", "127.0.0.1"], {
    NODE_ENV: "development",
    VITE_CACHE_DIR,
  });
  webProcess.stdout.on("data", (d) => log(`[web] ${d.toString().trim()}`));
  webProcess.stderr.on("data", (d) => log(`[web:err] ${d.toString().trim()}`));
  webProcess.on("exit", (code) => log(`Web exited with code ${code}`));
}

function waitForServer(port, timeout = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() - start > timeout) {
        return reject(new Error(`Server on port ${port} did not start in time`));
      }
      const req = http.get(`http://localhost:${port}`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => setTimeout(check, 500));
      req.end();
    }
    check();
  });
}

// Right-click menu with the standard edit actions. Without this, Electron
// windows have NO context menu at all — users can't right-click to copy/paste.
function attachContextMenu(win) {
  win.webContents.on("context-menu", (_event, params) => {
    const template = [
      { role: "cut", enabled: params.editFlags.canCut },
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", enabled: params.editFlags.canPaste },
      { type: "separator" },
      { role: "selectAll" },
    ];
    Menu.buildFromTemplate(template).popup({ window: win });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "GroupBlast",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  attachContextMenu(mainWindow);
  mainWindow.loadURL(`http://localhost:${WEB_PORT}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showLoadingWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "GroupBlast",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  attachContextMenu(mainWindow);
  mainWindow.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(
        `<!doctype html><html><head><meta charset="utf-8"></head>
         <body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;font-family:-apple-system,Segoe UI,sans-serif;background:#fff;color:#1e293b">
         <div style="text-align:center"><h1 style="font-size:28px;margin:0 0 8px">GroupBlast</h1>
         <p style="color:#64748b">Starting up... this takes a few seconds the first time.</p></div></body></html>`,
      ),
  );
}

function killChildren() {
  quitting = true; // prevent the API crash-restart from firing during shutdown
  for (const p of [apiProcess, webProcess]) {
    if (p && !p.killed) p.kill("SIGTERM");
  }
}

// Only allow one running copy. A second launch would fail to bind port 8080
// (strictPort) and could kill the first instance's backend. Instead, focus the
// window that's already open.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(async () => {
  log(`Starting servers (packaged=${app.isPackaged}, ROOT=${ROOT})...`);
  showLoadingWindow();
  startApiServer();
  startWebServer();
  try {
    // First launch on a cold machine bundles Vite deps, which can take a few
    // minutes. Use a generous timeout so a slow first run doesn't error out.
    await Promise.all([
      waitForServer(API_PORT, 300000),
      waitForServer(WEB_PORT, 300000),
    ]);
    log("All servers ready, loading app...");
    if (mainWindow) {
      mainWindow.loadURL(`http://localhost:${WEB_PORT}`);
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
      });
    } else {
      createWindow();
    }
  } catch (err) {
    log(`Failed to start: ${err.message}`);
    dialog.showErrorBox("GroupBlast", "Could not start the app. Please reopen it and try again.");
    killChildren();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  killChildren();
  app.quit();
});
app.on("before-quit", killChildren);
app.on("activate", () => {
  if (mainWindow === null && app.isReady()) createWindow();
});

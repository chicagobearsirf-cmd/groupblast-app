import { chromium, type BrowserContext, type Locator, type Page } from "playwright";
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { assertFacebookGroupUrl, delay, storage, timestamp } from "./db";
import {
  facebookSelectors,
  judgeComposerEditor,
  judgeComposerOpener,
  type ComposerCandidateSignals,
} from "./facebook-selectors";
import type {
  ChromeProfileDiagnostics,
  FacebookSessionCheckStatus,
  FacebookGroup,
  JoinedGroupsSyncRow,
  JoinedGroupsSyncStatus,
  PostSession,
  ResultStatus,
  RunnerDiagnostics,
  SessionStatus,
} from "./types";
import { categorizeGroupName } from "./group-categorizer";

const dataDir = process.env.GROUPBLAST_DATA_DIR
  ? resolve(process.env.GROUPBLAST_DATA_DIR)
  : resolve(process.cwd(), "data");
const debugDir = resolve(dataDir, "debug");
const chromeProfileDebugPath = join(debugDir, "chrome-profile-debug-latest.json");

// Build a filesystem-safe slug from a failure reason. Playwright timeout errors
// embed their entire call log (hundreds of chars); without a cap the resulting
// debug filename exceeds the OS limit and throws ENAMETOOLONG, which previously
// crashed the whole local API on a failed post. Keep it short and safe.
const debugReasonSlug = (reason: string) =>
  reason
    .replace(/[^a-z0-9_-]/gi, "_")
    .replace(/_+/g, "_")
    .slice(0, 60) || "unknown";
// Well-known Chrome install locations per platform, tried as launch fallbacks when
// the configured executable path is missing or wrong.
const defaultChromeExecutablePaths = (
  process.platform === "win32"
    ? [
        join(
          process.env.PROGRAMFILES ?? "C:\\Program Files",
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        ),
        join(
          process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        ),
        process.env.LOCALAPPDATA
          ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
          : "",
      ]
    : process.platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"]
).filter(Boolean);
// App-owned launch target for Imported Chrome Profile Snapshot mode. The app only
// ever launches Playwright against this copy — never against a live Chrome profile.
const snapshotUserDataDir = resolve(
  dataDir,
  "browser-profiles",
  "imported-facebook-profile",
);
// Chrome 136+ refuses remote debugging (which Playwright requires) when launched with
// the live default user data directory. Pointing the app at one of these paths can
// never work on a current Chrome, so we detect it and steer the user to a copy.
const defaultChromeUserDataDirs = [
  join(homedir(), "Library", "Application Support", "Google", "Chrome"),
  join(homedir(), ".config", "google-chrome"),
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Google", "Chrome", "User Data") : "",
].filter(Boolean);
// Skipped when copying a profile for automation: caches and lock/crash artifacts that
// Chrome regenerates, plus browsing-history databases the automation does not need.
const profileCloneSkipNames = new Set([
  "Cache",
  "Code Cache",
  "GPUCache",
  "GrShaderCache",
  "ShaderCache",
  "DawnGraphiteCache",
  "DawnWebGPUCache",
  "blob_storage",
  "Service Worker",
  "optimization_guide_hint_cache_store",
  "optimization_guide_model_store",
  "History",
  "History-journal",
  "Visited Links",
  "Top Sites",
  "Top Sites-journal",
  "Favicons",
  "Favicons-journal",
  "Crashpad",
  "BrowserMetrics",
]);
const emptyJoinedGroupsSyncStatus = (): JoinedGroupsSyncStatus => ({
  state: "idle",
  groupsFound: 0,
  duplicateCount: 0,
  newCount: 0,
  updatedCount: 0,
  currentPass: 0,
  noNewPasses: 0,
  maxGroups: 0,
  startedAt: null,
  completedAt: null,
  lastError: "",
  debugPath: "",
  rows: [],
});
const emptyDiagnostics = (): RunnerDiagnostics => ({
  runnerStatus: "idle",
  currentUrl: "",
  pageTitle: "",
  lastError: "",
  lastScreenshotPath: "",
  lastHtmlSnippetPath: "",
  lastDetectedState: "",
  lastSelectorAttemptSummary: "",
  lastWorkingSelector: "",
  lastDebugRecordPath: "",
  updatedAt: timestamp(),
});

class ChromeProfileError extends Error {
  constructor(
    message: string,
    readonly chromeProfileDiagnostics: ChromeProfileDiagnostics,
  ) {
    super(message);
    this.name = "ChromeProfileError";
  }
}

class HumanReviewRunner {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private browserLaunchKey = "";
  private activeSessionId: string | null = null;
  private paused = false;
  private stopped = false;
  private waitingForHuman = false;
  private groupStartedAt = 0;
  private consecutiveComposerFailures = 0;
  private diagnostics = emptyDiagnostics();
  private joinedGroupsSync = emptyJoinedGroupsSyncStatus();
  private joinedGroupsSyncStopRequested = false;

  async getStatus(sessionId?: string): Promise<SessionStatus> {
    const session = sessionId ? storage.getSession(sessionId) : storage.latestSession();
    if (!session) return this.emptyStatus();
    const currentGroup = session.selectedGroupIds[session.currentIndex]
      ? storage.getGroup(session.selectedGroupIds[session.currentIndex])
      : null;
    const nextGroup = session.selectedGroupIds[session.currentIndex + 1]
      ? storage.getGroup(session.selectedGroupIds[session.currentIndex + 1])
      : null;
    const results = storage.listResults(session.id);
    const counts = { posted: 0, skipped: 0, failed: 0, needs_review: 0, pending: 0 };
    for (const result of results) counts[result.status] += 1;
    return {
      session,
      currentGroup,
      nextGroup,
      results,
      counts,
      remainingCount: Math.max(session.selectedGroupIds.length - session.currentIndex, 0),
      totalCount: session.selectedGroupIds.length,
      diagnostics: await this.updatePageDiagnostics(),
    };
  }

  async start(sessionId: string) {
    const session = storage.getSession(sessionId);
    if (!session) throw new Error("Session not found.");
    if (this.activeSessionId && this.activeSessionId !== sessionId) {
      // Only block if the other session is genuinely still running. A session
      // that errored out, hit a login/checkpoint halt, or finished can leave
      // `activeSessionId` set even though the loop has ended — that used to wedge
      // the runner so no new queue could ever start. Treat anything not actively
      // running as stale, clear it, and take over.
      const other = storage.getSession(this.activeSessionId);
      const stillRunning = other?.state === "running" && !this.stopped;
      if (stillRunning) {
        throw new Error(
          "Another posting session is already active. Stop it first (or use Force Stop).",
        );
      }
      this.activeSessionId = null;
    }
    this.activeSessionId = sessionId;
    this.stopped = false;
    this.paused = false;
    // Reset waitingForHuman too — a leftover `true` from a prior halted session
    // would make this fresh loop immediately busy-wait and never post.
    this.waitingForHuman = false;
    this.consecutiveComposerFailures = 0;
    this.setDiagnostics({ runnerStatus: "running", lastError: "", lastDetectedState: "started" });
    storage.updateSession(sessionId, {
      state: "running",
      startedAt: session.startedAt ?? timestamp(),
    });
    void this.loop(sessionId);
  }

  pause() {
    this.paused = true;
    this.setDiagnostics({ runnerStatus: "paused", lastDetectedState: "paused" });
    if (this.activeSessionId) storage.updateSession(this.activeSessionId, { state: "paused" });
  }

  resume() {
    this.paused = false;
    this.setDiagnostics({ runnerStatus: "running", lastDetectedState: "resumed" });
    if (this.activeSessionId) storage.updateSession(this.activeSessionId, { state: "running" });
  }

  stop() {
    this.stopped = true;
    this.setDiagnostics({ runnerStatus: "stopped", lastDetectedState: "stopped" });
    if (this.activeSessionId)
      storage.updateSession(this.activeSessionId, { state: "stopped", completedAt: timestamp() });
    this.activeSessionId = null;
  }

  // Nuclear reset for when the runner is wedged — e.g. the user closed the
  // automation browser tabs mid-run and the app still thinks a session is live,
  // so nothing new will start. Clears ALL runner state unconditionally and tears
  // down a possibly-dead browser so the next run launches clean.
  async forceStop() {
    this.stopped = true;
    this.paused = false;
    this.waitingForHuman = false;
    this.consecutiveComposerFailures = 0;
    const lingering = this.activeSessionId;
    this.activeSessionId = null;
    if (lingering) {
      const session = storage.getSession(lingering);
      // Don't clobber a session already parked for human review; just release it.
      if (session && session.state === "running") {
        storage.updateSession(lingering, { state: "stopped", completedAt: timestamp() });
      }
    }
    if (this.context) {
      await this.context.close().catch(() => undefined);
      this.context = null;
      this.page = null;
    }
    this.setDiagnostics({ runnerStatus: "idle", lastError: "", lastDetectedState: "force_reset" });
    return this.getStatus();
  }

  async mark(status: ResultStatus, message = "") {
    const session = this.activeSessionId
      ? storage.getSession(this.activeSessionId)
      : storage.latestSession();
    if (!session) throw new Error("No active session.");
    const group = storage.getGroup(session.selectedGroupIds[session.currentIndex]);
    if (!group) throw new Error("No current group.");
    this.record(session, group, status, message);
    // Manually-confirmed admin-review results must carry evidence: capture what
    // the user saw (screenshot, URL, the approval wording) before we advance.
    if (message === "pending_admin_review" || message === "admin_approval_required") {
      const confirmationText = await this.gatherApprovalEvidence();
      await this.saveDebugArtifacts(session, group, message, {
        manuallyMarked: true,
        submitAttempted: false,
        confirmationText,
      });
    }
    this.waitingForHuman = false;
    this.setDiagnostics({
      runnerStatus: "running",
      lastDetectedState: status === "needs_review" && message ? message : status,
    });
    await this.advance(session);
  }

  async openCurrent() {
    const session = this.activeSessionId
      ? storage.getSession(this.activeSessionId)
      : storage.latestSession();
    if (!session) throw new Error("No session found.");
    const group = storage.getGroup(session.selectedGroupIds[session.currentIndex]);
    if (!group) throw new Error("No current group.");
    assertFacebookGroupUrl(group.url);
    await this.ensurePage();
    await this.page?.goto(group.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    if (this.page) await this.dismissBlockingDialogs(this.page);
  }

  // Re-attempt the current group from scratch (re-navigate + re-fill the composer)
  // WITHOUT recording a result or advancing. After a composer_not_found the runner
  // already stepped past the failed group — and a one-group session may have
  // completed — so we step back to the last attempted group, then clear the gates
  // and (re)start the loop so it re-processes that same group.
  async retryCurrent() {
    const session = this.activeSessionId
      ? storage.getSession(this.activeSessionId)
      : storage.latestSession();
    if (!session) throw new Error("No session found.");
    if (!session.selectedGroupIds.length) throw new Error("Session has no groups to retry.");

    let idx = session.currentIndex;
    if (idx >= session.selectedGroupIds.length) idx = session.selectedGroupIds.length - 1;
    if (idx < 0) idx = 0;

    storage.updateSession(session.id, {
      currentIndex: idx,
      state: "running",
      completedAt: null,
    });
    this.waitingForHuman = false;
    this.paused = false;
    this.consecutiveComposerFailures = 0;
    this.setDiagnostics({ runnerStatus: "running", lastError: "", lastDetectedState: "retry" });

    // If the loop already exited (session completed or stopped), restart it.
    // Otherwise the still-running loop picks up the cleared gate on its next tick.
    if (!this.activeSessionId) {
      this.activeSessionId = session.id;
      this.stopped = false;
      void this.loop(session.id);
    }
  }

  async launchFacebookLoginBrowser() {
    const settings = storage.getSettings();
    let diagnostics = await this.buildChromeProfileDiagnostics("launch");
    try {
      diagnostics = await this.ensurePage("launch", diagnostics);
      await this.page!.goto("https://www.facebook.com/", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      const sessionState = await this.detectFacebookSessionStatus(this.page!);
      diagnostics = await this.saveChromeProfileDiagnostics({
        ...diagnostics,
        currentUrl: this.page!.url(),
        pageTitle: await this.page!.title().catch(() => ""),
        detectedFacebookSessionState: sessionState,
      });
      this.setDiagnostics({
        runnerStatus: "idle",
        currentUrl: this.page!.url(),
        pageTitle: await this.page!.title().catch(() => ""),
        lastDetectedState: "facebook_login_browser_opened",
        lastError: "",
      });
      return {
        runnerDiagnostics: await this.updatePageDiagnostics(),
        chromeProfileDiagnostics: diagnostics,
      };
    } catch (error) {
      const errorDiagnostics =
        error instanceof Error && "chromeProfileDiagnostics" in error
          ? (error as { chromeProfileDiagnostics?: ChromeProfileDiagnostics })
              .chromeProfileDiagnostics
          : null;
      diagnostics = await this.saveChromeProfileDiagnostics({
        ...(errorDiagnostics ?? diagnostics),
        playwrightLaunchError: error instanceof Error ? error.message : String(error),
        currentUrl: this.page && !this.page.isClosed() ? this.page.url() : "",
        pageTitle:
          this.page && !this.page.isClosed() ? await this.page.title().catch(() => "") : "",
      });
      if (settings.browserMode === "imported_chrome_profile_snapshot") {
        throw new ChromeProfileError(this.getChromeProfileLaunchError(diagnostics), diagnostics);
      }
      throw error;
    }
  }

  async checkFacebookSession() {
    const settings = storage.getSettings();
    let diagnostics = await this.buildChromeProfileDiagnostics("check_session");
    try {
      diagnostics = await this.ensurePage("check_session", diagnostics);
      await this.page!.goto("https://www.facebook.com/", {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await delay(1500);
      const status = await this.detectFacebookSessionStatus(this.page!);
      storage.updateSettings({
        facebookSessionStatus: status,
        facebookSessionCheckedAt: timestamp(),
      });
      diagnostics = await this.saveChromeProfileDiagnostics({
        ...diagnostics,
        currentUrl: this.page!.url(),
        pageTitle: await this.page!.title().catch(() => ""),
        detectedFacebookSessionState: status,
      });
      this.setDiagnostics({
        runnerStatus: "idle",
        currentUrl: this.page!.url(),
        pageTitle: await this.page!.title().catch(() => ""),
        lastDetectedState: status,
        lastError: status === "logged_in" ? "" : status,
      });
      return {
        status,
        diagnostics: await this.updatePageDiagnostics(),
        chromeProfileDiagnostics: diagnostics,
      };
    } catch (error) {
      const errorDiagnostics =
        error instanceof Error && "chromeProfileDiagnostics" in error
          ? (error as { chromeProfileDiagnostics?: ChromeProfileDiagnostics })
              .chromeProfileDiagnostics
          : null;
      diagnostics = await this.saveChromeProfileDiagnostics({
        ...(errorDiagnostics ?? diagnostics),
        playwrightLaunchError: error instanceof Error ? error.message : String(error),
        currentUrl: this.page && !this.page.isClosed() ? this.page.url() : "",
        pageTitle:
          this.page && !this.page.isClosed() ? await this.page.title().catch(() => "") : "",
      });
      if (settings.browserMode === "imported_chrome_profile_snapshot") {
        throw new ChromeProfileError(this.getChromeProfileLaunchError(diagnostics), diagnostics);
      }
      throw error;
    }
  }

  async testChromeProfilePath() {
    return this.saveChromeProfileDiagnostics(await this.buildChromeProfileDiagnostics("test"));
  }

  // Copies the configured Chrome profile (ideally a dedicated "Facebook Automation"
  // profile, logged into Facebook manually) into data/browser-profiles/
  // imported-facebook-profile. Playwright only ever launches that snapshot; the live
  // Chrome profile is never automated. This is the Playwright-documented answer to
  // Chrome 136+ refusing automation against live Chrome profiles. It is a plain local
  // file copy of the user's own profile — no login automation and no security bypass.
  async importChromeProfileSnapshot() {
    const settings = storage.getSettings();
    let diagnostics = await this.buildChromeProfileDiagnostics("import_snapshot");
    const fail = async (message: string) => {
      diagnostics = await this.saveChromeProfileDiagnostics({
        ...diagnostics,
        playwrightLaunchError: message,
      });
      return new ChromeProfileError(message, diagnostics);
    };
    if (!diagnostics.userDataDirExists) {
      throw await fail("Chrome user data directory does not exist, so there is nothing to copy.");
    }
    if (!diagnostics.profileDirExists || !diagnostics.preferencesExists) {
      throw await fail(
        `Profile directory "${diagnostics.chromeProfileDirectoryUsed}" was not found inside the user data directory (or has no Preferences file). Check chrome://version for the right Profile Path.`,
      );
    }
    if (diagnostics.chromeAppearsLockedOrOpen) {
      throw await fail(
        `Chrome appears to be open (${diagnostics.lockIndicators.join(", ") || "profile lock"} found in the source profile). Quit Chrome completely (Cmd+Q) before importing so cookie databases are not copied mid-write, then try again.`,
      );
    }
    // Release any browser this app already has open before replacing the snapshot it runs from.
    if (this.context) {
      await this.context.close().catch(() => undefined);
      this.context = null;
      this.page = null;
      this.browserLaunchKey = "";
    }
    const profileDirectory = basename(diagnostics.chromeProfileDirectoryUsed);
    const sourceProfile = diagnostics.resolvedProfilePath;
    const targetProfile = join(snapshotUserDataDir, profileDirectory);
    await rm(snapshotUserDataDir, { recursive: true, force: true });
    await mkdir(snapshotUserDataDir, { recursive: true });
    for (const rootFile of ["Local State", "First Run"]) {
      const source = join(settings.chromeUserDataDir, rootFile);
      if (await this.pathExists(source)) {
        await cp(source, join(snapshotUserDataDir, rootFile));
      }
    }
    await cp(sourceProfile, targetProfile, {
      recursive: true,
      force: true,
      filter: (source) => {
        const name = basename(source);
        return !profileCloneSkipNames.has(name) && !name.startsWith("Singleton");
      },
    });
    const copiedFileCount = (await readdir(targetProfile, { recursive: true })).length;
    const nextSettings = storage.updateSettings({
      browserMode: "imported_chrome_profile_snapshot",
      chromeProfileSnapshotProfileDirectory: profileDirectory,
      chromeProfileSnapshotImportedAt: timestamp(),
      chromeProfileSnapshotSource: `${settings.chromeUserDataDir} (${profileDirectory})`,
    });
    diagnostics = await this.saveChromeProfileDiagnostics(
      await this.buildChromeProfileDiagnostics("import_snapshot"),
    );
    return {
      settings: nextSettings,
      chromeProfileDiagnostics: diagnostics,
      snapshotPath: snapshotUserDataDir,
      snapshotProfileDirectory: profileDirectory,
      copiedFileCount,
    };
  }

  getJoinedGroupsSyncStatus() {
    return this.joinedGroupsSync;
  }

  async startJoinedGroupsSync() {
    if (this.activeSessionId) throw new Error("Stop the posting session before syncing groups.");
    if (this.joinedGroupsSync.state === "running") {
      throw new Error("A joined groups sync is already running.");
    }
    const settings = storage.getSettings();
    this.joinedGroupsSyncStopRequested = false;
    this.joinedGroupsSync = {
      ...emptyJoinedGroupsSyncStatus(),
      state: "running",
      maxGroups: Math.max(1, settings.maxJoinedGroupsSyncPerRun),
      startedAt: timestamp(),
    };
    void this.runJoinedGroupsSync();
    return this.joinedGroupsSync;
  }

  stopJoinedGroupsSync() {
    this.joinedGroupsSyncStopRequested = true;
    if (this.joinedGroupsSync.state === "running") {
      this.updateJoinedGroupsSync({
        state: "stopped",
        completedAt: timestamp(),
        lastError: "Stopped by user.",
      });
    }
    return this.joinedGroupsSync;
  }

  markJoinedGroupsSyncImported() {
    this.updateJoinedGroupsSync({ state: "imported", completedAt: timestamp() });
    return this.joinedGroupsSync;
  }

  private async runJoinedGroupsSync() {
    try {
      await this.ensurePage();
      const page = this.page!;
      await page.goto(storage.getSettings().joinedGroupsSyncUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await delay(2000);
      const sessionStatus = await this.detectFacebookSessionStatus(page);
      if (sessionStatus === "not_logged_in" || sessionStatus === "checkpoint_or_review") {
        throw new Error(
          `Facebook session is ${sessionStatus}. Handle it manually and check session.`,
        );
      }

      const settings = storage.getSettings();
      const maxGroups = Math.max(1, settings.maxJoinedGroupsSyncPerRun);
      const scrollDelay = Math.max(250, settings.joinedGroupsSyncScrollDelayMs);
      const stopAfterNoNew = Math.max(1, settings.joinedGroupsSyncStopAfterNoNewPasses);
      const defaultCategory = settings.joinedGroupsSyncDefaultCategory.trim() || "Uncategorized";
      const seen = new Map<string, JoinedGroupsSyncRow>();
      let noNewPasses = 0;
      let pass = 0;

      while (
        !this.joinedGroupsSyncStopRequested &&
        seen.size < maxGroups &&
        noNewPasses < stopAfterNoNew
      ) {
        pass += 1;
        const before = seen.size;
        const links = await this.extractVisibleFacebookGroupLinks(page);
        const capturedAt = timestamp();
        for (const link of links) {
          if (seen.size >= maxGroups) break;
          const normalizedUrl = this.normalizeFacebookGroupUrl(link.url);
          if (!normalizedUrl || seen.has(normalizedUrl)) continue;
          const groupName = link.name || "Facebook Group";
          const auto = categorizeGroupName(groupName);
          seen.set(normalizedUrl, {
            name: groupName,
            url: normalizedUrl,
            category: auto.category !== "Uncategorized" ? auto.category : defaultCategory,
            subcategory: auto.subcategory,
            tags: [],
            status: "active",
            source: "facebook_joined_groups_sync",
            capturedAt,
            updatedAt: capturedAt,
            notes: "Imported from joined groups sync",
          });
        }
        noNewPasses = seen.size === before ? noNewPasses + 1 : 0;
        this.updateJoinedGroupsSync({
          rows: Array.from(seen.values()),
          currentPass: pass,
          noNewPasses,
          maxGroups,
        });
        if (seen.size >= maxGroups || noNewPasses >= stopAfterNoNew) break;
        await page.mouse.wheel(0, 1800);
        await delay(scrollDelay);
      }

      if (this.joinedGroupsSyncStopRequested) {
        this.updateJoinedGroupsSync({ state: "stopped", completedAt: timestamp() });
        return;
      }
      this.updateJoinedGroupsSync({
        state: "ready",
        rows: Array.from(seen.values()),
        completedAt: timestamp(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "joined_groups_sync_failed";
      const debugPath = await this.saveJoinedGroupsSyncDebugArtifacts(message);
      this.updateJoinedGroupsSync({
        state: "failed",
        lastError: message,
        debugPath,
        completedAt: timestamp(),
      });
    }
  }

  private async extractVisibleFacebookGroupLinks(page: Page) {
    const rawLinks = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).map((anchor) => {
        const label =
          anchor.getAttribute("aria-label") ||
          anchor.innerText ||
          anchor.textContent ||
          anchor.closest('[role="article"], [role="row"], div')?.textContent ||
          "";
        return {
          name: label.replace(/\s+/g, " ").trim(),
          url: anchor.href,
        };
      }),
    );
    return rawLinks
      .map((link) => ({ ...link, url: this.normalizeFacebookGroupUrl(link.url) }))
      .filter((link) => link.url && link.name && !this.isFacebookGroupsShellUrl(link.url));
  }

  private normalizeFacebookGroupUrl(url: string) {
    try {
      const parsed = new URL(url, "https://www.facebook.com");
      if (!parsed.hostname.includes("facebook.com")) return "";
      const groupsMatch = parsed.pathname.match(/^\/groups\/([^/?#]+)/i);
      if (!groupsMatch?.[1]) return "";
      const groupKey = decodeURIComponent(groupsMatch[1]);
      if (!groupKey || this.isFacebookGroupsShellKey(groupKey)) return "";
      return `https://www.facebook.com/groups/${encodeURIComponent(groupKey)}`;
    } catch {
      return "";
    }
  }

  private isFacebookGroupsShellUrl(url: string) {
    try {
      const parsed = new URL(url);
      const groupKey = parsed.pathname.split("/").filter(Boolean)[1] ?? "";
      return this.isFacebookGroupsShellKey(groupKey);
    } catch {
      return true;
    }
  }

  private isFacebookGroupsShellKey(groupKey: string) {
    return [
      "",
      "discover",
      "feed",
      "joins",
      "notifications",
      "create",
      "category",
      "browse",
    ].includes(groupKey.toLowerCase());
  }

  private updateJoinedGroupsSync(patch: Partial<JoinedGroupsSyncStatus>) {
    const rows = patch.rows ?? this.joinedGroupsSync.rows;
    const existingUrls = new Set(
      storage.listGroups().map((group) => storage.normalizeUrl(group.url)),
    );
    const duplicateCount = rows.filter((row) =>
      existingUrls.has(storage.normalizeUrl(row.url)),
    ).length;
    this.joinedGroupsSync = {
      ...this.joinedGroupsSync,
      ...patch,
      rows,
      groupsFound: rows.length,
      duplicateCount,
      updatedCount: duplicateCount,
      newCount: rows.length - duplicateCount,
    };
  }

  private async loop(sessionId: string) {
    while (!this.stopped) {
      const session = storage.getSession(sessionId);
      if (!session || session.currentIndex >= session.selectedGroupIds.length) {
        storage.updateSession(sessionId, { state: "completed", completedAt: timestamp() });
        this.setDiagnostics({ runnerStatus: "idle", lastDetectedState: "completed" });
        this.activeSessionId = null;
        return;
      }
      if (this.paused || this.waitingForHuman) {
        await delay(750);
        continue;
      }
      const group = storage.getGroup(session.selectedGroupIds[session.currentIndex]);
      if (!group || group.status === "removed" || group.status === "paused") {
        if (group) this.record(session, group, "skipped", "Group is paused or removed.");
        await this.advance(session);
        continue;
      }
      await this.prepareGroup(session, group);
    }
  }

  private async prepareGroup(session: PostSession, group: FacebookGroup) {
    this.groupStartedAt = Date.now();
    try {
      assertFacebookGroupUrl(group.url);
      await this.ensurePage();
      await this.page!.goto(group.url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await delay(1500);
      await this.dismissBlockingDialogs(this.page!);
      const settings = storage.getSettings();
      const failure = await this.detectFailureState(this.page!);
      if (failure) {
        this.consecutiveComposerFailures = 0;
        this.record(session, group, "needs_review", failure);
        this.setDiagnostics({ lastError: failure, lastDetectedState: failure });
        // not_logged_in always halts the session; checkpoint halts unless the user
        // explicitly disabled Stop on checkpoint in Settings (default is on).
        if (
          failure === "not_logged_in" ||
          (failure === "security_checkpoint" && settings.stopOnCheckpoint)
        ) {
          await this.saveDebugArtifacts(session, group, failure);
          this.stopForReview(session, failure);
          return;
        }
        if (failure === "security_checkpoint") {
          await this.saveDebugArtifacts(session, group, failure);
        }
        await this.advance(session);
        return;
      }
      let filled = await this.fillComposer(this.page!, session.postText);
      if (!filled) {
        // A pop-up (group rules, "suggested for you", invite prompt…) may have
        // appeared AFTER the first dismiss pass and be covering the composer.
        // Dismiss again and retry once before recording a failure.
        await this.dismissBlockingDialogs(this.page!);
        await delay(1000);
        filled = await this.fillComposer(this.page!, session.postText);
      }
      if (!filled) {
        this.consecutiveComposerFailures += 1;
        this.record(session, group, "needs_review", "composer_not_found");
        this.setDiagnostics({
          lastError: "composer_not_found",
          lastDetectedState: `composer_not_found_${this.consecutiveComposerFailures}`,
        });
        await this.saveDebugArtifacts(session, group, "composer_not_found");
        if (this.consecutiveComposerFailures >= 3 && settings.stopOnRepeatedFailures) {
          this.pauseForReview(session, "Paused after 3 consecutive composer_not_found failures.");
          return;
        }
        await this.advance(session);
        return;
      }
      this.consecutiveComposerFailures = 0;

      if (!settings.autoSubmitEnabled) {
        // Human-review mode: composer filled, nothing submitted. HONEST waiting
        // state — we record no result until the user posts and marks the outcome.
        storage.updateSession(session.id, { state: "needs_review" });
        this.waitingForHuman = true;
        this.setDiagnostics({
          runnerStatus: "waiting_for_human",
          lastError: "",
          lastDetectedState: "ready_for_manual_review",
        });
        return;
      }

      // Auto-submit mode: click Post and judge the outcome by what Facebook does.
      const outcome = await this.submitComposer(this.page!);
      if (outcome === "submitted") {
        this.record(session, group, "posted", "Auto-submitted.");
        this.setDiagnostics({
          runnerStatus: "running",
          lastError: "",
          lastDetectedState: "auto_posted",
        });
      } else if (outcome === "pending_admin") {
        this.record(session, group, "needs_review", "admin_approval_required");
        const confirmationText = await this.gatherApprovalEvidence();
        await this.saveDebugArtifacts(session, group, "admin_approval_required", {
          manuallyMarked: false,
          submitAttempted: true,
          confirmationText,
        });
        this.setDiagnostics({
          runnerStatus: "running",
          lastError: "",
          lastDetectedState: "auto_pending_admin_review",
        });
      } else {
        // Could not confirm submission. Record for review and keep the run moving
        // (a 50-group run shouldn't stall on one group), with a screenshot saved.
        this.record(session, group, "needs_review", "auto_submit_failed");
        await this.saveDebugArtifacts(session, group, "auto_submit_failed", {
          submitAttempted: true,
        });
        this.setDiagnostics({
          runnerStatus: "running",
          lastError: "auto_submit_failed",
          lastDetectedState: "auto_submit_failed",
        });
      }
      await this.advance(session);
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      this.record(session, group, "failed", message);
      await this.saveDebugArtifacts(session, group, message);
      this.setDiagnostics({
        runnerStatus: "error",
        lastError: message,
        lastDetectedState: "error",
      });
      await this.advance(session);
    }
  }

  private async ensurePage(
    action: ChromeProfileDiagnostics["action"] = "launch",
    existingDiagnostics?: ChromeProfileDiagnostics,
  ) {
    const settings = storage.getSettings();
    const launchConfig = this.getBrowserLaunchConfig(settings);
    if (this.page && !this.page.isClosed() && this.browserLaunchKey === launchConfig.key) {
      return existingDiagnostics ?? (await this.buildChromeProfileDiagnostics(action));
    }
    if (this.context) {
      await this.context.close().catch(() => undefined);
      this.context = null;
      this.page = null;
    }
    let diagnostics = existingDiagnostics ?? (await this.buildChromeProfileDiagnostics(action));
    diagnostics = { ...diagnostics, launchAttempted: true };
    if (
      settings.browserMode === "imported_chrome_profile_snapshot" &&
      (!diagnostics.snapshotExists || !diagnostics.snapshotProfileDirExists)
    ) {
      // The app never launches a live Chrome profile; without a snapshot there is
      // nothing safe to launch, so fail fast with instructions instead of letting
      // Chrome create an empty logged-out profile.
      diagnostics = await this.saveChromeProfileDiagnostics({
        ...diagnostics,
        playwrightLaunchError:
          "No imported Chrome profile snapshot found. Quit Chrome completely, then click Import Chrome Profile Snapshot in Settings to copy your logged-in profile into the app's snapshot folder.",
      });
      throw new ChromeProfileError(this.getChromeProfileLaunchError(diagnostics), diagnostics);
    }

    const attempts = this.getBrowserLaunchAttempts(settings);
    let lastError: unknown = null;
    for (const [index, attempt] of attempts.entries()) {
      try {
        this.context = await chromium.launchPersistentContext(launchConfig.userDataDir, {
          headless: false,
          viewport: { width: 1365, height: 900 },
          executablePath: attempt.executablePath,
          channel: attempt.executablePath ? undefined : attempt.channel,
          args: launchConfig.args,
        });
        this.browserLaunchKey = launchConfig.key;
        this.page = this.context.pages()[0] ?? (await this.context.newPage());
        const savedDiagnostics = await this.saveChromeProfileDiagnostics({
          ...diagnostics,
          launchMethod: attempt.label,
          fallbackAttempted: index > 0,
          playwrightLaunchError: "",
        });
        return savedDiagnostics;
      } catch (error) {
        lastError = error;
        const errorMessage = error instanceof Error ? error.message : String(error);
        diagnostics = await this.saveChromeProfileDiagnostics({
          ...diagnostics,
          launchMethod: attempt.label,
          fallbackAttempted: index > 0,
          playwrightLaunchError: errorMessage,
        });
        if (
          settings.browserMode === "imported_chrome_profile_snapshot" &&
          this.isChromeLockError(errorMessage)
        ) {
          throw new ChromeProfileError(this.getChromeProfileLaunchError(diagnostics), diagnostics);
        }
      }
    }
    if (settings.browserMode === "imported_chrome_profile_snapshot") {
      throw new ChromeProfileError(this.getChromeProfileLaunchError(diagnostics), diagnostics);
    }
    throw lastError;
  }

  private getBrowserLaunchConfig(settings: ReturnType<typeof storage.getSettings>) {
    if (settings.browserMode === "imported_chrome_profile_snapshot") {
      // Launch only the app-owned snapshot copy — never the live Chrome user data dir.
      const profileDirectory = settings.chromeProfileSnapshotProfileDirectory.trim() || "Default";
      const executablePath = settings.chromeExecutablePath.trim() || undefined;
      return {
        key: [
          settings.browserMode,
          snapshotUserDataDir,
          executablePath ?? "chrome-channel",
          profileDirectory,
        ].join("|"),
        userDataDir: snapshotUserDataDir,
        executablePath,
        channel: "chrome" as const,
        // Force the window to a known on-screen position. Without this, Chrome
        // restores whatever position was last saved in this profile's
        // Preferences file, which can be off-screen if the monitor setup
        // changed (e.g. a second display was disconnected).
        args: [`--profile-directory=${profileDirectory}`, "--window-position=0,0"],
      };
    }
    return {
      key: [settings.browserMode, settings.browserProfilePath].join("|"),
      userDataDir: settings.browserProfilePath,
      executablePath: undefined,
      channel: undefined,
      args: ["--window-position=0,0"],
    };
  }

  private getBrowserLaunchAttempts(settings: ReturnType<typeof storage.getSettings>) {
    if (settings.browserMode !== "imported_chrome_profile_snapshot") {
      return [
        {
          label: "managed_playwright_bundled_chromium",
          channel: undefined,
          executablePath: undefined,
        },
      ];
    }
    const configuredExecutable = settings.chromeExecutablePath.trim();
    const attempts: { label: string; channel?: "chrome"; executablePath?: string }[] = [];
    if (configuredExecutable) {
      attempts.push({
        label: "configured_executable_path",
        executablePath: configuredExecutable,
      });
    } else {
      attempts.push({ label: "chrome_channel", channel: "chrome" });
    }
    for (const executablePath of defaultChromeExecutablePaths) {
      if (executablePath !== configuredExecutable) {
        attempts.push({ label: "default_chrome_executable_path", executablePath });
      }
    }
    return attempts;
  }

  private getChromeProfileLaunchError(diagnostics: ChromeProfileDiagnostics) {
    if (!diagnostics.snapshotExists || !diagnostics.snapshotProfileDirExists) {
      return [
        "No imported Chrome profile snapshot is available to launch.",
        "Chrome 136+ blocks automation against live Chrome profiles, so the app only launches snapshot copies.",
        "Quit Chrome completely, then click Import Chrome Profile Snapshot in Settings.",
        diagnostics.playwrightLaunchError,
      ].join(" ");
    }
    if (this.isChromeLockError(diagnostics.playwrightLaunchError)) {
      return [
        "The snapshot profile appears to be in use by another browser process.",
        "Close other automation windows launched by this app, then try again.",
        diagnostics.playwrightLaunchError,
      ].join(" ");
    }
    return `Could not launch the imported Chrome profile snapshot. ${diagnostics.playwrightLaunchError}`;
  }

  private isChromeLockError(details: string) {
    return /singleton|lock|process|profile|already|in use|cannot create/i.test(details);
  }

  private async buildChromeProfileDiagnostics(
    action: ChromeProfileDiagnostics["action"],
  ): Promise<ChromeProfileDiagnostics> {
    const settings = storage.getSettings();
    const rawProfile = settings.chromeProfileDirectory.trim() || "Default";
    const profileDirectory = basename(rawProfile);
    if (profileDirectory !== rawProfile) {
      throw new Error("Chrome profile directory must be a simple name, not a path");
    }
    const resolvedProfilePath = join(settings.chromeUserDataDir, profileDirectory);
    const [
      executableExists,
      userDataDirExists,
      profileDirExists,
      preferencesExists,
      cookiesExists,
      loginDataExists,
      localStateExists,
      userDataDirHasPreferences,
    ] = await Promise.all([
      this.pathExists(settings.chromeExecutablePath),
      this.pathExists(settings.chromeUserDataDir),
      this.pathExists(resolvedProfilePath),
      this.pathExists(join(resolvedProfilePath, "Preferences")),
      this.anyPathExists([
        join(resolvedProfilePath, "Cookies"),
        join(resolvedProfilePath, "Network", "Cookies"),
      ]),
      this.pathExists(join(resolvedProfilePath, "Login Data")),
      this.pathExists(join(settings.chromeUserDataDir, "Local State")),
      this.pathExists(join(settings.chromeUserDataDir, "Preferences")),
    ]);
    const snapshotProfileDirectory =
      settings.chromeProfileSnapshotProfileDirectory.trim() || "Default";
    const [snapshotExists, snapshotProfileDirExists] = await Promise.all([
      this.pathExists(join(snapshotUserDataDir, "Local State")),
      this.pathExists(join(snapshotUserDataDir, snapshotProfileDirectory, "Preferences")),
    ]);
    const lockIndicators = (
      await Promise.all(
        ["SingletonLock", "SingletonCookie", "SingletonSocket", "RunningChromeVersion"].map(
          async (name) =>
            (await this.pathExists(join(settings.chromeUserDataDir, name))) ? name : "",
        ),
      )
    ).filter(Boolean);
    const userDataDirBase = basename(settings.chromeUserDataDir);
    // A real user data dir contains "Local State"; a profile folder contains
    // "Preferences" directly. Pasting the full Profile Path from chrome://version
    // into the user data dir field is the most common misconfiguration.
    const pathLooksLikeFullProfilePath =
      /^(Default|Profile \d+)$/i.test(userDataDirBase) ||
      (userDataDirHasPreferences && !localStateExists);
    const isDefaultChromeUserDataDir = defaultChromeUserDataDirs.some(
      (dir) => resolve(settings.chromeUserDataDir) === resolve(dir),
    );
    const warnings: string[] = [];
    if (pathLooksLikeFullProfilePath) {
      warnings.push(
        "Chrome user data directory appears to be a full Profile Path. Use the parent Chrome directory as user data dir and put the final folder in profile directory.",
      );
    }
    if (
      settings.browserMode === "imported_chrome_profile_snapshot" &&
      isDefaultChromeUserDataDir &&
      profileDirectory.toLowerCase() === "default"
    ) {
      warnings.push(
        "The import source looks like your primary Chrome profile. Recommended: create a separate Chrome profile named Facebook Automation, log into Facebook there manually, quit Chrome, and import that profile instead.",
      );
    }
    if (settings.browserMode === "imported_chrome_profile_snapshot" && !snapshotExists) {
      warnings.push(
        "No Chrome profile snapshot has been imported yet. Quit Chrome and click Import Chrome Profile Snapshot. The app never launches your live Chrome profile directly (Chrome 136+ blocks that).",
      );
    }
    if (!executableExists) warnings.push("Chrome executable path does not exist.");
    if (!userDataDirExists) warnings.push("Chrome user data directory does not exist.");
    if (!profileDirExists)
      warnings.push("Chrome profile directory does not exist inside user data dir.");
    if (profileDirExists && !preferencesExists) {
      warnings.push("Profile directory exists, but Preferences was not found.");
    }
    if (lockIndicators.length) {
      warnings.push(
        `Chrome appears to be open or the source profile is locked (${lockIndicators.join(", ")}). Quit Chrome completely (Cmd+Q) before importing a snapshot.`,
      );
    }
    return {
      timestamp: timestamp(),
      action,
      browserMode: settings.browserMode,
      chromeExecutablePathUsed: settings.chromeExecutablePath,
      chromeUserDataDirUsed: settings.chromeUserDataDir,
      chromeProfileDirectoryUsed: profileDirectory,
      resolvedProfilePath,
      executableExists,
      userDataDirExists,
      profileDirExists,
      preferencesExists,
      cookiesExists,
      loginDataExists,
      localStateExists,
      isDefaultChromeUserDataDir,
      pathLooksLikeFullProfilePath,
      snapshotPath: snapshotUserDataDir,
      snapshotExists,
      snapshotProfileDirExists,
      snapshotProfileDirectory,
      snapshotImportedAt: settings.chromeProfileSnapshotImportedAt ?? "",
      snapshotSource: settings.chromeProfileSnapshotSource,
      chromeAppearsLockedOrOpen: lockIndicators.length > 0,
      lockIndicators,
      launchAttempted: false,
      launchMethod: "",
      fallbackAttempted: false,
      playwrightLaunchError: "",
      currentUrl: this.page && !this.page.isClosed() ? this.page.url() : "",
      pageTitle: this.page && !this.page.isClosed() ? await this.page.title().catch(() => "") : "",
      detectedFacebookSessionState: "",
      debugPath: chromeProfileDebugPath,
      warnings,
    };
  }

  private async saveChromeProfileDiagnostics(diagnostics: ChromeProfileDiagnostics) {
    const next = { ...diagnostics, timestamp: timestamp(), debugPath: chromeProfileDebugPath };
    await mkdir(debugDir, { recursive: true });
    await writeFile(chromeProfileDebugPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }

  private async pathExists(path: string) {
    if (!path.trim()) return false;
    return stat(path)
      .then(() => true)
      .catch(() => false);
  }

  private async anyPathExists(paths: string[]) {
    const results = await Promise.all(paths.map((path) => this.pathExists(path)));
    return results.some(Boolean);
  }

  // Facebook sometimes overlays a non-composer dialog when a group page loads —
  // a "Welcome to [Group]" intro, group rules acknowledgement, "Suggested for
  // you" upsell, etc. These sit on top of the page and make the real "Write
  // something" trigger invisible, which fillComposer reads as no-composer-found.
  // Unattended, that silently eats a group (or, after 3 in a row, pauses the
  // whole session) until a human clicks through it. We close anything that LOOKS
  // like an interstitial — explicitly skipping any dialog that contains a
  // textbox/contenteditable, since that would be the real composer dialog.
  private async dismissBlockingDialogs(page: Page) {
    const closeSelectors = [
      'div[role="dialog"] div[aria-label="Close" i]',
      'div[role="dialog"] [aria-label="Close" i]',
      'div[role="dialog"] div[role="button"]:has-text("Got it")',
      'div[role="dialog"] div[role="button"]:has-text("Continue")',
      'div[role="dialog"] div[role="button"]:has-text("OK")',
      'div[role="dialog"] div[role="button"]:has-text("I agree")',
      'div[role="dialog"] div[role="button"]:has-text("Dismiss")',
      'div[role="dialog"] div[role="button"]:has-text("Not now")',
      'div[role="dialog"] div[role="button"]:has-text("Next")',
      'div[role="dialog"] div[role="button"]:has-text("Done")',
      'div[role="dialog"] div[role="button"]:has-text("Finish")',
      'div[role="dialog"] div[role="button"]:has-text("Skip")',
    ];
    // Cap iterations: "welcome to the group" interstitials are multi-step
    // wizards (Next -> Next -> ... -> Got it/Done), so this needs more passes
    // than a single stacked-dialog case would.
    for (let i = 0; i < 6; i += 1) {
      const dialog = page.locator('div[role="dialog"]').first();
      if (!(await dialog.isVisible({ timeout: 1000 }).catch(() => false))) return;
      const isComposer = await dialog
        .locator('div[role="textbox"], div[contenteditable="true"]')
        .first()
        .isVisible({ timeout: 500 })
        .catch(() => false);
      if (isComposer) return;

      let closed = false;
      for (const selector of closeSelectors) {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 800 }).catch(() => false)) {
          closed = await button
            .click({ timeout: 3000 })
            .then(() => true)
            .catch(() => false);
          if (closed) break;
        }
      }
      if (!closed) {
        // Last resort: Escape closes most FB modals without affecting the
        // underlying group page.
        await page.keyboard.press("Escape").catch(() => undefined);
      }
      await delay(800);
    }
  }

  // Detects only HARD blockers that exist BEFORE we try to post: not logged in,
  // a security checkpoint, or a group page that didn't load. It deliberately does
  // NOT infer admin_approval_required / duplicate from page text: before a post is
  // submitted, "pending approval" / "admin approval" / "already posted" wording
  // comes from group rules, the sidebar, the About section, or membership
  // questions — it is NOT evidence that a post was made or is pending review.
  // Admin-review is only recorded when the user confirms it (Mark Pending Admin
  // Review) or, in a future submit flow, Facebook confirms it after submission.
  private async detectFailureState(page: Page) {
    const sessionStatus = await this.detectFacebookSessionStatus(page);
    if (sessionStatus === "not_logged_in") return "not_logged_in";
    if (sessionStatus === "checkpoint_or_review") return "security_checkpoint";
    const body = (
      await page
        .locator("body")
        .innerText({ timeout: 5000 })
        .catch(() => "")
    ).toLowerCase();
    if (body.includes("content isn't available") || body.includes("this content isn't available"))
      return "group_unavailable";
    return null;
  }

  private async detectFacebookSessionStatus(page: Page): Promise<FacebookSessionCheckStatus> {
    const url = page.url();
    const body = (
      await page
        .locator("body")
        .innerText({ timeout: 5000 })
        .catch(() => "")
    ).toLowerCase();
    if (
      url.includes("checkpoint") ||
      body.includes("security check") ||
      body.includes("confirm your identity") ||
      body.includes("account review") ||
      body.includes("review recent login")
    ) {
      return "checkpoint_or_review";
    }
    if (
      url.includes("/login") ||
      body.includes("log in to facebook") ||
      body.includes("log into facebook") ||
      (body.includes("email or phone") && body.includes("password"))
    ) {
      return "not_logged_in";
    }
    const cookies = await this.context?.cookies("https://www.facebook.com").catch(() => []);
    if (cookies?.some((cookie) => cookie.name === "c_user" && cookie.value)) return "logged_in";
    return "unknown";
  }

  // Collect the accessibility/structure signals we use to decide whether a
  // candidate is the real main composer (vs a comment/reply/answer/search box).
  // Returns null if the element vanished between selection and inspection.
  private async gatherComposerSignals(locator: Locator): Promise<ComposerCandidateSignals | null> {
    return locator
      .evaluate((el, commentSelectors: string) => {
        const clean = (value: string | null | undefined) =>
          (value || "").replace(/\s+/g, " ").trim();
        const container =
          el.closest('div[role="dialog"], [role="article"], form, li') ?? el.parentElement;
        return {
          role: el.getAttribute("role"),
          ariaLabel: el.getAttribute("aria-label"),
          placeholder:
            el.getAttribute("placeholder") ??
            el.getAttribute("aria-placeholder") ??
            el.getAttribute("data-placeholder"),
          visibleText: clean((el as HTMLElement).innerText).slice(0, 100),
          nearbyText: clean(container instanceof HTMLElement ? container.innerText : "").slice(
            0,
            100,
          ),
          insideDialog: !!el.closest('div[role="dialog"]'),
          insideCommentContext: commentSelectors ? !!el.closest(commentSelectors) : false,
        };
      }, facebookSelectors.commentContextSelectors.join(","))
      .catch(() => null);
  }

  private describeCandidate(
    kind: string,
    selector: string,
    signals: ComposerCandidateSignals | null,
    accepted: boolean,
    reason: string,
  ) {
    const s = signals;
    return [
      `${kind} ${accepted ? "ACCEPTED" : "REJECTED"} :: ${selector}`,
      `  role=${s?.role ?? "-"} aria=${JSON.stringify(s?.ariaLabel ?? "")} placeholder=${JSON.stringify(s?.placeholder ?? "")}`,
      `  near=${JSON.stringify(s?.nearbyText ?? "")} inDialog=${s?.insideDialog ?? "-"} inComment=${s?.insideCommentContext ?? "-"}`,
      `  reason=${reason}`,
    ].join("\n");
  }

  private async fillComposer(page: Page, postText: string) {
    const attempts: string[] = [];

    // 1) Find and validate a main create-post opener. We do NOT blindly click the
    //    first match — each candidate is inspected and must pass judgeOpener.
    //
    //    Facebook renders a server skeleton, then re-hydrates and SWAPS OUT the
    //    "Write something" button for a fresh DOM node. A single inspection pass
    //    that lands mid-swap sees the element vanish ("disappeared before
    //    inspection") and wrongly concludes there is no composer. So we retry the
    //    whole detection sweep a few times, letting the page settle between passes.
    const OPENER_PASSES = 4;
    let opener: Locator | null = null;
    let openerSelector = "";
    // A visible candidate whose signals we could never read (Facebook detaches the
    // node mid-evaluate, consistently — not just a transient race). We keep the
    // first one as a fallback: if the judge never accepts anything, we still try
    // clicking it, because the real safety gate is downstream — a click only
    // proceeds if it opens a modal composer dialog AND the post text lands in it.
    let fallbackOpener: Locator | null = null;
    let fallbackSelector = "";
    for (let pass = 0; pass < OPENER_PASSES && !opener; pass += 1) {
      if (pass > 0) await delay(1500);
      for (const selector of facebookSelectors.composerTriggers) {
        const candidate = page.locator(selector).first();
        if (!(await candidate.isVisible({ timeout: 1500 }).catch(() => false))) {
          attempts.push(`opener REJECTED (pass ${pass + 1}) :: ${selector}\n  reason=not visible`);
          continue;
        }
        const signals = await this.gatherComposerSignals(candidate);
        const verdict = signals
          ? judgeComposerOpener(signals)
          : { accepted: false, reason: "element disappeared before inspection" };
        attempts.push(
          this.describeCandidate(
            `opener (pass ${pass + 1})`,
            selector,
            signals,
            verdict.accepted,
            verdict.reason,
          ),
        );
        if (verdict.accepted) {
          opener = candidate;
          openerSelector = selector;
          break;
        }
        if (!signals && !fallbackOpener) {
          fallbackOpener = candidate;
          fallbackSelector = selector;
        }
      }
    }

    if (!opener && fallbackOpener) {
      opener = fallbackOpener;
      openerSelector = `${fallbackSelector} (fallback: visible but uninspectable; verified by dialog open)`;
      attempts.push(
        `opener FALLBACK :: ${fallbackSelector}\n  reason=visible candidate could not be inspected; trying click, will verify via composer dialog`,
      );
    }

    if (!opener) {
      this.setDiagnostics({
        lastSelectorAttemptSummary: attempts.join("\n"),
        lastWorkingSelector: "opener=none (no confirmed main composer opener)",
      });
      return false;
    }

    const openerClicked = await opener
      .click({ timeout: 4000 })
      .then(() => true)
      .catch((error) => {
        attempts.push(
          `opener click FAILED :: ${openerSelector}\n  reason=${error instanceof Error ? error.message : String(error)}`,
        );
        return false;
      });
    if (!openerClicked) {
      this.setDiagnostics({
        lastSelectorAttemptSummary: attempts.join("\n"),
        lastWorkingSelector: `opener=${openerSelector}; click=failed`,
      });
      return false;
    }

    // 2) Wait for the composer dialog/modal (with an editable area) to open.
    const dialogEditor = page
      .locator(
        'div[role="dialog"] div[role="textbox"], div[role="dialog"] div[contenteditable="true"]',
      )
      .first();
    const dialogOpened = await dialogEditor
      .waitFor({ state: "visible", timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (!dialogOpened) {
      attempts.push(
        `dialog REJECTED :: after opener ${openerSelector}\n  reason=composer dialog did not open`,
      );
      this.setDiagnostics({
        lastSelectorAttemptSummary: attempts.join("\n"),
        lastWorkingSelector: `opener=${openerSelector}; dialog=none`,
      });
      return false;
    }

    // 3) Find the textbox INSIDE the dialog and validate it before typing.
    for (const selector of facebookSelectors.composerEditorsInDialog) {
      const candidate = page.locator(selector).first();
      if (!(await candidate.isVisible({ timeout: 2500 }).catch(() => false))) {
        attempts.push(`editor REJECTED :: ${selector}\n  reason=not visible`);
        continue;
      }
      const signals = await this.gatherComposerSignals(candidate);
      const verdict = signals
        ? judgeComposerEditor(signals)
        : { accepted: false, reason: "element disappeared before inspection" };
      attempts.push(
        this.describeCandidate("editor", selector, signals, verdict.accepted, verdict.reason),
      );
      // When we could read signals, trust the judge. When we couldn't (signals
      // null — same detach behavior as the opener), still attempt the type: the
      // read-back below is the real proof, since text only "lands" in a genuine
      // editor. Only a judged-REJECTED editor (signals present, verdict false) is
      // skipped outright.
      if (signals && !verdict.accepted) continue;

      try {
        await candidate.click({ timeout: 4000 });
        // keyboard.insertText types into whatever element currently has focus,
        // NOT necessarily this locator. Facebook re-renders the composer mid-open,
        // so focus can land elsewhere and the text silently goes nowhere. Read the
        // editor back and only report success if the post text actually landed —
        // otherwise the UI would say "ready to post" over an empty box.
        await page.keyboard.insertText(postText);
        const landed = await candidate
          .evaluate((el) => (el as HTMLElement).innerText ?? "")
          .catch(() => "");
        if (!landed.trim()) {
          attempts.push(
            `editor REJECTED :: ${selector}\n  reason=insertText did not land in this editor (focus lost / re-render)`,
          );
          continue;
        }
        this.setDiagnostics({
          lastSelectorAttemptSummary: attempts.join("\n"),
          lastWorkingSelector: `opener=${openerSelector}; editor=${selector}`,
        });
        return true;
      } catch (error) {
        attempts.push(
          `editor REJECTED :: ${selector}\n  reason=fill threw: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
    }

    this.setDiagnostics({
      lastSelectorAttemptSummary: attempts.join("\n"),
      lastWorkingSelector: `opener=${openerSelector}; editor=none (no valid textbox in dialog)`,
    });
    return false;
  }

  // Click the composer's Post button and judge the outcome by what Facebook does —
  // never by the click alone. The composer dialog CLOSING is FB's confirmation it
  // accepted the submit; if the dialog stays open, we treat it as unconfirmed.
  // Called only when auto-submit is enabled, after fillComposer verified the text.
  private async submitComposer(page: Page): Promise<"submitted" | "pending_admin" | "failed"> {
    const dialogEditor = page
      .locator(
        'div[role="dialog"] div[role="textbox"], div[role="dialog"] div[contenteditable="true"]',
      )
      .first();

    let clicked = false;
    for (const selector of facebookSelectors.postButtons) {
      const button = page.locator(selector).first();
      if (!(await button.isVisible({ timeout: 1500 }).catch(() => false))) continue;
      // Skip a Post button FB has greyed out (e.g. empty post / still uploading).
      const disabled = await button.getAttribute("aria-disabled").catch(() => null);
      if (disabled === "true") continue;
      if (
        await button
          .click({ timeout: 4000 })
          .then(() => true)
          .catch(() => false)
      ) {
        clicked = true;
        break;
      }
    }
    if (!clicked) return "failed";

    const closed = await dialogEditor
      .waitFor({ state: "hidden", timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (!closed) return "failed";

    // Groups that hold posts for admin approval show pending wording afterward.
    await delay(1200);
    const evidence = await this.gatherApprovalEvidence();
    return evidence ? "pending_admin" : "submitted";
  }

  private record(
    session: PostSession,
    group: FacebookGroup,
    status: ResultStatus,
    message: string,
  ) {
    storage.addResult({
      sessionId: session.id,
      groupId: group.id,
      groupName: group.name,
      groupUrl: group.url,
      status,
      message,
      durationSeconds: Math.max(0, Math.round((Date.now() - this.groupStartedAt) / 1000)),
    });
  }

  private async advance(session: PostSession) {
    const settings = storage.getSettings();
    const min = Math.max(0, settings.minDelaySeconds);
    const max = Math.max(min, settings.maxDelaySeconds);
    const delaySeconds = Math.floor(min + Math.random() * (max - min + 1));
    storage.updateSession(session.id, { currentIndex: session.currentIndex + 1, state: "running" });
    if (!this.stopped && delaySeconds > 0) await delay(delaySeconds * 1000);
  }

  private stopForReview(session: PostSession, reason: string) {
    this.stopped = true;
    this.waitingForHuman = true;
    // The session is genuinely over (login/checkpoint halt) — release the runner
    // so the user can fix the issue and start a new queue. Human-review actions
    // (Mark Posted, etc.) still resolve via storage.latestSession().
    this.activeSessionId = null;
    storage.updateSession(session.id, { state: "needs_review" });
    this.setDiagnostics({ runnerStatus: "stopped", lastError: reason, lastDetectedState: reason });
  }

  private pauseForReview(session: PostSession, reason: string) {
    this.paused = true;
    this.waitingForHuman = true;
    storage.updateSession(session.id, { state: "paused" });
    this.setDiagnostics({ runnerStatus: "paused", lastError: reason, lastDetectedState: reason });
  }

  // Pulls the approval/pending/review wording currently visible on the page, so a
  // manually-marked pending-admin-review result has concrete evidence attached
  // instead of an unsubstantiated status.
  private async gatherApprovalEvidence(): Promise<string> {
    const page = this.page;
    if (!page || page.isClosed()) return "";
    const body = await page
      .locator("body")
      .innerText({ timeout: 3000 })
      .catch(() => "");
    const lines = body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.length <= 200)
      .filter((line) => /pending|approval|awaiting|admin review|reviewed by/i.test(line));
    return lines.slice(0, 5).join(" | ").slice(0, 300);
  }

  private async saveDebugArtifacts(
    session: PostSession,
    group: FacebookGroup,
    reason: string,
    extra?: Record<string, unknown>,
  ) {
    await mkdir(debugDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = `${stamp}_${session.id}_${group.id}_${debugReasonSlug(reason)}`;
    const screenshotPath = join(debugDir, `${base}.png`);
    const htmlPath = join(debugDir, `${base}.html`);
    const recordPath = join(debugDir, `${base}.json`);
    const page = this.page;
    const currentUrl = page?.url() ?? "";
    const pageTitle = page ? await page.title().catch(() => "") : "";
    if (page) {
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
      const html = await page.content().catch(() => "");
      const snippet = this.safeHtmlSnippet(html);
      await writeFile(htmlPath, snippet, "utf8").catch(() => undefined);
    }
    const record = {
      timestamp: timestamp(),
      reason,
      sessionId: session.id,
      groupId: group.id,
      groupName: group.name,
      groupUrl: group.url,
      currentUrl,
      pageTitle,
      screenshotPath,
      htmlSnippetPath: htmlPath,
      detectedState: this.diagnostics.lastDetectedState,
      selectorAttemptSummary: this.diagnostics.lastSelectorAttemptSummary,
      ...extra,
    };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8").catch(
      () => undefined,
    );
    this.setDiagnostics({
      currentUrl,
      pageTitle,
      lastError: reason,
      lastScreenshotPath: screenshotPath,
      lastHtmlSnippetPath: htmlPath,
      lastDebugRecordPath: recordPath,
      lastDetectedState: reason,
    });
  }

  private async saveJoinedGroupsSyncDebugArtifacts(reason: string) {
    await mkdir(debugDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const base = `${stamp}_joined_groups_sync_${debugReasonSlug(reason)}`;
    const screenshotPath = join(debugDir, `${base}.png`);
    const htmlPath = join(debugDir, `${base}.html`);
    const recordPath = join(debugDir, `${base}.json`);
    const page = this.page;
    const currentUrl = page?.url() ?? "";
    const pageTitle = page ? await page.title().catch(() => "") : "";
    if (page) {
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
      const html = await page.content().catch(() => "");
      await writeFile(htmlPath, this.safeHtmlSnippet(html), "utf8").catch(() => undefined);
    }
    const record = {
      timestamp: timestamp(),
      reason,
      syncState: this.joinedGroupsSync.state,
      groupsFound: this.joinedGroupsSync.groupsFound,
      currentPass: this.joinedGroupsSync.currentPass,
      noNewPasses: this.joinedGroupsSync.noNewPasses,
      currentUrl,
      pageTitle,
      screenshotPath,
      htmlSnippetPath: htmlPath,
    };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8").catch(
      () => undefined,
    );
    return recordPath;
  }

  private safeHtmlSnippet(html: string) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .slice(0, 12000);
  }

  private setDiagnostics(patch: Partial<RunnerDiagnostics>) {
    this.diagnostics = { ...this.diagnostics, ...patch, updatedAt: timestamp() };
  }

  private async updatePageDiagnostics() {
    const page = this.page && !this.page.isClosed() ? this.page : null;
    if (!page) return this.diagnostics;
    this.setDiagnostics({
      currentUrl: page.url(),
      pageTitle: await page.title().catch(() => this.diagnostics.pageTitle),
      runnerStatus: this.paused
        ? "paused"
        : this.waitingForHuman
          ? "waiting_for_human"
          : this.stopped
            ? "stopped"
            : this.activeSessionId
              ? "running"
              : "idle",
    });
    return this.diagnostics;
  }

  private emptyStatus(): SessionStatus {
    return {
      session: null,
      currentGroup: null,
      nextGroup: null,
      results: [],
      counts: { posted: 0, skipped: 0, failed: 0, needs_review: 0, pending: 0 },
      remainingCount: 0,
      totalCount: 0,
      diagnostics: this.diagnostics,
    };
  }
}

export const runner = new HumanReviewRunner();

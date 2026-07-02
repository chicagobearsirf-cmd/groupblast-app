import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/groups/GroupStatusBadge";
import { ApiErrorAlert } from "@/components/layout/ApiErrorAlert";
import { ApiError, api } from "@/lib/api";
import { queryKeys, useInvalidate, useSettings } from "@/hooks/use-api";
import type { AppSettings, ChromeProfileDiagnostics } from "@/types";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

const sessionStatusBadge: Record<AppSettings["facebookSessionStatus"], string> = {
  logged_in: "active",
  not_logged_in: "failed",
  checkpoint_or_review: "needs_review",
  never_checked: "paused",
  unknown: "paused",
};

const browserModeLabel: Record<AppSettings["browserMode"], string> = {
  managed_playwright_profile: "Managed Playwright Profile",
  imported_chrome_profile_snapshot: "Imported Chrome Profile Snapshot",
};

function SettingsPage() {
  const { data: settings, error: settingsError, isFetching, refetch } = useSettings();
  const invalidate = useInvalidate();
  const [form, setForm] = useState<AppSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionMessage, setSessionMessage] = useState("");
  const [chromeVersionText, setChromeVersionText] = useState("");
  const [chromeDiagnostics, setChromeDiagnostics] = useState<ChromeProfileDiagnostics | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings, form]);

  if (!form) {
    // Without this branch, any /api/settings failure left the page stuck on
    // "Loading settings…" forever — the original "Settings does not load" bug.
    if (settingsError) {
      return (
        <div className="flex max-w-xl flex-col gap-4">
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Facebook browser session tools and automation safety limits.
            </p>
          </div>
          <Alert variant="destructive">
            <AlertDescription>
              Could not load settings from the local API:{" "}
              {settingsError instanceof Error ? settingsError.message : String(settingsError)}. Make
              sure the app was started with <code>npm run dev</code> so the local API is running on
              http://localhost:3001, then retry.
            </AlertDescription>
          </Alert>
          <div>
            <Button disabled={isFetching} onClick={() => void refetch()}>
              {isFetching ? "Retrying…" : "Retry"}
            </Button>
          </div>
        </div>
      );
    }
    return <p className="text-sm text-muted-foreground">Loading settings…</p>;
  }

  const set = (patch: Partial<AppSettings>) =>
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (error) {
      if (error instanceof ApiError && error.chromeProfileDiagnostics) {
        setChromeDiagnostics(error.chromeProfileDiagnostics);
      }
      setActionError(error);
      toast.error(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const next = await api.updateSettings(form);
      setForm(next);
      await invalidate(queryKeys.settings);
      toast.success("Settings saved.");
    });

  const launchLoginBrowser = () =>
    run(async () => {
      const response = await api.launchLoginBrowser();
      setChromeDiagnostics(response.chromeProfileDiagnostics);
      const profile =
        response.settings.browserMode === "imported_chrome_profile_snapshot"
          ? `${response.chromeProfileDiagnostics.snapshotPath} (${response.chromeProfileDiagnostics.snapshotProfileDirectory})`
          : response.settings.browserProfilePath;
      setSessionMessage(
        `Opened facebook.com using ${browserModeLabel[response.settings.browserMode] ?? response.settings.browserMode}: ${profile}`,
      );
    });

  const checkFacebookSession = () =>
    run(async () => {
      const response = await api.checkFacebookSession();
      setChromeDiagnostics(response.chromeProfileDiagnostics);
      setForm(response.settings);
      await invalidate(queryKeys.settings);
      setSessionMessage(`Facebook session check: ${response.status}`);
      toast.success(`Session check: ${response.status}`);
    });

  const testChromeProfile = () =>
    run(async () => {
      const response = await api.testChromeProfile();
      setChromeDiagnostics(response.chromeProfileDiagnostics);
      toast.success(
        response.chromeProfileDiagnostics.warnings.length
          ? "Chrome profile test finished with warnings."
          : "Chrome profile paths look valid.",
      );
    });

  const importProfileSnapshot = () => {
    if (
      !window.confirm(
        "Copy the selected Chrome profile into data/browser-profiles/imported-facebook-profile and launch only that snapshot from now on? Quit Chrome completely (Cmd+Q) before continuing.",
      )
    ) {
      return;
    }
    void run(async () => {
      const response = await api.importProfileSnapshot();
      setChromeDiagnostics(response.chromeProfileDiagnostics);
      setForm(response.settings);
      await invalidate(queryKeys.settings);
      setSessionMessage(
        `Snapshot imported to ${response.snapshotPath} (${response.snapshotProfileDirectory}, ${response.copiedFileCount} files). Your live Chrome profile stays untouched. Use Launch Facebook Login Browser to verify the session carried over.`,
      );
      toast.success("Chrome profile snapshot imported.");
    });
  };

  const importChromeVersion = () => {
    const executablePath = extractChromeVersionValue(chromeVersionText, "Executable Path");
    const profilePath = extractChromeVersionValue(chromeVersionText, "Profile Path");
    if (!executablePath && !profilePath) {
      toast.error("Could not find Executable Path or Profile Path in the pasted text.");
      return;
    }
    const patch: Partial<AppSettings> = { browserMode: "imported_chrome_profile_snapshot" };
    if (executablePath) patch.chromeExecutablePath = executablePath;
    if (profilePath) {
      // chrome://version shows the full Profile Path; split the final folder (the
      // profile directory) from its parent (the user data dir). Windows paths use
      // backslashes, Mac/Linux forward slashes.
      const trimmed = profilePath.replace(/[\\/]+$/, "");
      const lastSeparator = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
      if (lastSeparator > 0) {
        patch.chromeUserDataDir = trimmed.slice(0, lastSeparator);
        patch.chromeProfileDirectory = trimmed.slice(lastSeparator + 1);
      }
    }
    set(patch);
    toast.success("Chrome profile settings filled from chrome://version.");
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Facebook browser session tools and automation safety limits.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Facebook Browser Session</CardTitle>
          <CardDescription>
            Opens facebook.com in the configured visible browser profile. The app never automates
            Facebook login, checkpoints, captchas, or security prompts.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Browser mode</dt>
            <dd className="font-medium">
              {browserModeLabel[form.browserMode] ?? form.browserMode}
            </dd>
            <dt className="text-muted-foreground">Launch profile</dt>
            <dd className="break-all font-medium">
              {form.browserMode === "imported_chrome_profile_snapshot"
                ? `data/browser-profiles/imported-facebook-profile (${form.chromeProfileSnapshotProfileDirectory || "no snapshot yet"})`
                : form.browserProfilePath}
            </dd>
            {form.browserMode === "imported_chrome_profile_snapshot" ? (
              <>
                <dt className="text-muted-foreground">Snapshot</dt>
                <dd className="break-all font-medium">
                  {form.chromeProfileSnapshotImportedAt
                    ? `Imported ${new Date(form.chromeProfileSnapshotImportedAt).toLocaleString()} from ${form.chromeProfileSnapshotSource || "unknown source"}`
                    : "Not imported yet — quit Chrome and click Import Chrome Profile Snapshot"}
                </dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Last check</dt>
            <dd>
              <StatusBadge
                status={sessionStatusBadge[form.facebookSessionStatus] ?? "paused"}
                label={(form.facebookSessionStatus ?? "never_checked").replace(/_/g, " ")}
              />
            </dd>
            <dt className="text-muted-foreground">Checked at</dt>
            <dd className="font-medium">
              {form.facebookSessionCheckedAt
                ? new Date(form.facebookSessionCheckedAt).toLocaleString()
                : "Never"}
            </dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void launchLoginBrowser()}>
              Launch Facebook Login Browser
            </Button>
            <Button disabled={busy} onClick={() => void checkFacebookSession()}>
              Check Facebook Session
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void testChromeProfile()}>
              Test Chrome Profile Path
            </Button>
            <Button variant="outline" disabled={busy} onClick={importProfileSnapshot}>
              Import Chrome Profile Snapshot
            </Button>
          </div>
          {actionError ? (
            <ApiErrorAlert error={actionError} title="Facebook session action failed" />
          ) : null}
          {sessionMessage ? (
            <Alert>
              <AlertDescription>{sessionMessage}</AlertDescription>
            </Alert>
          ) : null}
          <Alert>
            <AlertDescription className="flex flex-col gap-1.5">
              <span className="font-medium">
                Being logged into Facebook in your normal Chrome tab does NOT mean the app browser
                is logged in.
              </span>
              <span>
                The app never drives your everyday Chrome. It uses one of two isolated browsers: a{" "}
                <strong>Managed Playwright Profile</strong> (a fresh profile the app controls) or an{" "}
                <strong>Imported Chrome Profile Snapshot</strong> (a copy of a profile you logged
                into manually). To reuse your existing Facebook login:
              </span>
              <ol className="ml-4 list-decimal space-y-0.5">
                <li>In Chrome, create a separate profile named “Facebook Automation”.</li>
                <li>Log into Facebook there manually (handle any checkpoint yourself).</li>
                <li>Quit Chrome completely (Cmd+Q on Mac / Exit on Windows).</li>
                <li>
                  Paste that profile’s <code>chrome://version</code> below, click{" "}
                  <strong>Import Chrome Profile Snapshot</strong>.
                </li>
                <li>
                  Click <strong>Launch Facebook Login Browser</strong>, then{" "}
                  <strong>Check Facebook Session</strong> to confirm it carried over.
                </li>
              </ol>
            </AlertDescription>
          </Alert>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Browser mode</Label>
              <Select
                value={form.browserMode}
                onValueChange={(browserMode) =>
                  set({ browserMode: browserMode as AppSettings["browserMode"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="managed_playwright_profile">
                    Managed Playwright Profile
                  </SelectItem>
                  <SelectItem value="imported_chrome_profile_snapshot">
                    Imported Chrome Profile Snapshot
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="profile-path">Managed profile path</Label>
              <Input
                id="profile-path"
                value={form.browserProfilePath}
                onChange={(event) => set({ browserProfilePath: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="chrome-executable">Chrome executable path</Label>
              <Input
                id="chrome-executable"
                value={form.chromeExecutablePath}
                onChange={(event) => set({ chromeExecutablePath: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="chrome-user-data">Chrome user data directory (import source)</Label>
              <Input
                id="chrome-user-data"
                value={form.chromeUserDataDir}
                onChange={(event) => set({ chromeUserDataDir: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Where the snapshot is copied FROM — never launched directly. Mac:
                ~/Library/Application Support/Google/Chrome — Windows:
                C:\Users\&lt;you&gt;\AppData\Local\Google\Chrome\User Data
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="chrome-profile">Chrome profile to import</Label>
              <Input
                id="chrome-profile"
                value={form.chromeProfileDirectory}
                onChange={(event) => set({ chromeProfileDirectory: event.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Common folders: Default, Profile 1, Profile 2. Prefer a dedicated profile, not your
                primary one.
              </p>
            </div>
          </div>
          <Alert>
            <AlertDescription>
              Chrome 136 and newer block automation against live Chrome profiles, so this app never
              launches your real Chrome profile. Instead it launches an imported snapshot copy.
              Recommended setup: (1) in Chrome, create a separate profile named Facebook Automation
              — do not use your primary profile; (2) log into Facebook there manually; (3) quit
              Chrome completely (Cmd+Q on Mac, Exit from the taskbar menu on Windows — an open
              Chrome holds SingletonLock/SingletonSocket files and the import will refuse to copy);
              (4) paste chrome://version from that profile below and click Import Chrome Profile
              Snapshot. The snapshot lands in data/browser-profiles/imported-facebook-profile and
              your live profile is never touched. The app never automates login, checkpoints,
              captchas, or security prompts.
            </AlertDescription>
          </Alert>
          <div className="grid gap-2">
            <Label htmlFor="chrome-version">Import from chrome://version</Label>
            <Textarea
              id="chrome-version"
              className="min-h-[110px] font-mono text-xs"
              value={chromeVersionText}
              onChange={(event) => setChromeVersionText(event.target.value)}
              placeholder={
                "Paste Chrome version details containing:\nExecutable Path: C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\nProfile Path: C:\\Users\\you\\AppData\\Local\\Google\\Chrome\\User Data\\Profile 1"
              }
            />
            <div>
              <Button variant="outline" disabled={busy} onClick={importChromeVersion}>
                Fill Chrome Profile Settings
              </Button>
            </div>
          </div>
          {chromeDiagnostics ? <ChromeDiagnosticsPanel diagnostics={chromeDiagnostics} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automation Settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label>Default mode</Label>
              <Input value="human_review" disabled />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="min-delay">Min delay seconds</Label>
              <Input
                id="min-delay"
                type="number"
                value={form.minDelaySeconds}
                onChange={(event) => set({ minDelaySeconds: Number(event.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                Time between posts. We recommend 480+ (8 minutes) — posting faster can get your
                Facebook account temporarily restricted.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="max-delay">Max delay seconds</Label>
              <Input
                id="max-delay"
                type="number"
                value={form.maxDelaySeconds}
                onChange={(event) => set({ maxDelaySeconds: Number(event.target.value) })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="max-posts-day">Max posts per day</Label>
              <Input
                id="max-posts-day"
                type="number"
                value={form.maxPostsPerDay}
                onChange={(event) => set({ maxPostsPerDay: Number(event.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                GroupBlast stops for the day after this many posts in 24 hours. Keep it at 25 or
                below to stay under Facebook's radar — going higher risks a temporary block.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="max-groups">Max groups per session</Label>
              <Input
                id="max-groups"
                type="number"
                value={form.maxGroupsPerSession}
                onChange={(event) => set({ maxGroupsPerSession: Number(event.target.value) })}
              />
              <p className="text-xs text-muted-foreground">
                You can raise this anytime — it's just a safety cap on how many groups one run
                will post to.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="default-category">Default category</Label>
              <Input
                id="default-category"
                value={form.defaultCategory}
                onChange={(event) => set({ defaultCategory: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sync-max-groups">Max groups to sync per run</Label>
              <Input
                id="sync-max-groups"
                type="number"
                value={form.maxJoinedGroupsSyncPerRun}
                onChange={(event) => set({ maxJoinedGroupsSyncPerRun: Number(event.target.value) })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sync-scroll-delay">Sync scroll delay ms</Label>
              <Input
                id="sync-scroll-delay"
                type="number"
                value={form.joinedGroupsSyncScrollDelayMs}
                onChange={(event) =>
                  set({ joinedGroupsSyncScrollDelayMs: Number(event.target.value) })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sync-no-new">Stop after no-new passes</Label>
              <Input
                id="sync-no-new"
                type="number"
                value={form.joinedGroupsSyncStopAfterNoNewPasses}
                onChange={(event) =>
                  set({ joinedGroupsSyncStopAfterNoNewPasses: Number(event.target.value) })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sync-category">Default synced group category</Label>
              <Input
                id="sync-category"
                value={form.joinedGroupsSyncDefaultCategory}
                onChange={(event) => set({ joinedGroupsSyncDefaultCategory: event.target.value })}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="sync-url">Joined groups sync URL</Label>
              <Input
                id="sync-url"
                value={form.joinedGroupsSyncUrl}
                onChange={(event) => set({ joinedGroupsSyncUrl: event.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                {[
                  "https://www.facebook.com/groups/joins/",
                  "https://www.facebook.com/groups/feed/",
                  "https://www.facebook.com/groups/",
                ].map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => set({ joinedGroupsSyncUrl: preset })}
                  >
                    {preset.replace("https://www.facebook.com", "")}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Page the joined-groups sync scrolls to collect group links. Must be a facebook.com
                /groups page; anything else is reset to the default joins page.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label>Theme</Label>
              <Select
                value={form.theme}
                onValueChange={(theme) => set({ theme: theme as AppSettings["theme"] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">light</SelectItem>
                  <SelectItem value="dark">dark</SelectItem>
                  <SelectItem value="system">system</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={form.stopOnCheckpoint}
                onCheckedChange={(checked) => set({ stopOnCheckpoint: checked })}
              />
              Stop on checkpoint
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={form.stopOnRepeatedFailures}
                onCheckedChange={(checked) => set({ stopOnRepeatedFailures: checked })}
              />
              Stop on repeated failures
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={form.autoSubmitEnabled}
                onCheckedChange={(checked) => set({ autoSubmitEnabled: checked })}
              />
              <span>
                Auto-submit posts
                <span className="block text-xs text-muted-foreground">
                  When on, the app clicks Post for you. When off, it fills the box and waits for you
                  to post. Posting fast across many groups raises Facebook ban risk — keep delays
                  on.
                </span>
              </span>
            </label>
          </div>
          <div>
            <Button disabled={busy} onClick={() => void save()}>
              Save settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function extractChromeVersionValue(text: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`${escaped}\\s*:?\\s*(.+)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function ChromeDiagnosticsPanel({ diagnostics }: { diagnostics: ChromeProfileDiagnostics }) {
  const rows: [string, string | boolean][] = [
    ["Browser mode", diagnostics.browserMode],
    ["Chrome executable path used", diagnostics.chromeExecutablePathUsed],
    ["Chrome user data dir used", diagnostics.chromeUserDataDirUsed],
    ["Chrome profile directory used", diagnostics.chromeProfileDirectoryUsed],
    ["Resolved profile path", diagnostics.resolvedProfilePath],
    ["Executable exists", diagnostics.executableExists],
    ["User data dir exists", diagnostics.userDataDirExists],
    ["Profile dir exists", diagnostics.profileDirExists],
    ["Preferences exists", diagnostics.preferencesExists],
    ["Cookies exists", diagnostics.cookiesExists],
    ["Login Data exists", diagnostics.loginDataExists],
    ["Local State exists", diagnostics.localStateExists],
    ["Source is Chrome's live default data dir", diagnostics.isDefaultChromeUserDataDir],
    ["Looks like full Profile Path", diagnostics.pathLooksLikeFullProfilePath],
    ["Snapshot path", diagnostics.snapshotPath],
    ["Snapshot exists", diagnostics.snapshotExists],
    ["Snapshot profile dir exists", diagnostics.snapshotProfileDirExists],
    ["Snapshot profile directory", diagnostics.snapshotProfileDirectory || "None"],
    ["Snapshot imported at", diagnostics.snapshotImportedAt || "Never"],
    ["Snapshot source", diagnostics.snapshotSource || "None"],
    ["Chrome appears locked/open", diagnostics.chromeAppearsLockedOrOpen],
    ["Launch attempted", diagnostics.launchAttempted],
    ["Launch method", diagnostics.launchMethod || "None"],
    ["Fallback attempted", diagnostics.fallbackAttempted],
    ["Current URL", diagnostics.currentUrl || "None"],
    ["Page title", diagnostics.pageTitle || "None"],
    ["Detected Facebook session state", diagnostics.detectedFacebookSessionState || "None"],
    ["Debug file", diagnostics.debugPath],
  ];
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 text-sm font-medium">Chrome Profile Diagnostics</div>
      <dl className="grid gap-2 text-xs sm:grid-cols-[220px_1fr]">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="break-all font-medium">{String(value)}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Lock indicators</dt>
        <dd className="break-all font-medium">{diagnostics.lockIndicators.join(", ") || "None"}</dd>
        <dt className="text-muted-foreground">Playwright launch error</dt>
        <dd className="break-all font-medium">{diagnostics.playwrightLaunchError || "None"}</dd>
      </dl>
      {diagnostics.warnings.length ? (
        <Alert className="mt-3">
          <AlertDescription>{diagnostics.warnings.join(" ")}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

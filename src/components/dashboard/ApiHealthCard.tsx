import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { StatusBadge } from "@/components/groups/GroupStatusBadge";
import {
  api,
  apiInfo,
  clearLastApiError,
  getLastApiError,
  subscribeLastApiError,
  type LastApiError,
} from "@/lib/api";

type HealthState = "idle" | "ok" | "fail";
type ProbeResult = { name: string; ok: boolean; detail: string };

// Read-only preview payload — preview never writes to the database.
const PREVIEW_SAMPLE = [
  "name,url,category",
  "API Health Probe,https://www.facebook.com/groups/healthprobe,General",
].join("\n");

const healthBadge: Record<HealthState, { status: string; label: string }> = {
  idle: { status: "paused", label: "checking…" },
  ok: { status: "active", label: "online" },
  fail: { status: "failed", label: "offline" },
};

export function ApiHealthCard() {
  const [health, setHealth] = useState<HealthState>("idle");
  const [healthDetail, setHealthDetail] = useState("");
  const [probe, setProbe] = useState<ProbeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<LastApiError | null>(getLastApiError());

  const testHealth = async () => {
    setBusy(true);
    setProbe(null);
    try {
      const result = await api.health();
      setHealth("ok");
      setHealthDetail(`:${result.port ?? "?"}`);
      setProbe({
        name: "API Health",
        ok: true,
        detail: `ok=${result.ok}, service=${result.service ?? "?"}, port=${result.port ?? "?"}`,
      });
    } catch (error) {
      setHealth("fail");
      setHealthDetail("");
      setProbe({
        name: "API Health",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  const runProbe = async (name: string, fn: () => Promise<string>) => {
    setBusy(true);
    setProbe(null);
    try {
      setProbe({ name, ok: true, detail: await fn() });
    } catch (error) {
      setProbe({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(false);
    }
  };

  const testFacebookEndpoint = () =>
    runProbe("Facebook endpoint", async () => {
      const result = await api.testChromeProfile();
      return `Reachable (no browser opened). Browser mode: ${result.settings.browserMode}. Snapshot imported: ${result.chromeProfileDiagnostics.snapshotExists}.`;
    });

  const testSyncEndpoint = () =>
    runProbe("Joined groups sync endpoint", async () => {
      const status = await api.joinedGroupsSyncStatus();
      return `Reachable (sync not started). State: ${status.state}, groups found: ${status.groupsFound}.`;
    });

  const testImportEndpoint = () =>
    runProbe("Import preview endpoint", async () => {
      const preview = await api.importPreview(PREVIEW_SAMPLE, "csv");
      return `Reachable (nothing imported). Parsed ${preview.totalRows} row(s), ${preview.diagnostics?.length ?? 0} warning(s).`;
    });

  useEffect(() => subscribeLastApiError(setLastError), []);
  useEffect(() => {
    void testHealth();
  }, []);

  const badge = healthBadge[health];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Local API Health
          </CardTitle>
          <StatusBadge status={badge.status} label={badge.label} />
        </div>
        <CardDescription>
          Confirms the browser can reach the local Express API and that each route group answers.
          All tests are read-only — none open a browser, start a sync, or import anything.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-[150px_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Local API</dt>
          <dd className="font-medium">
            {health === "ok"
              ? `Online ${healthDetail}`
              : health === "fail"
                ? "Offline / unreachable"
                : "Checking…"}
          </dd>
          <dt className="text-muted-foreground">Frontend origin</dt>
          <dd className="break-all font-medium">{apiInfo.origin || "unknown"}</dd>
          <dt className="text-muted-foreground">API base URL</dt>
          <dd className="break-all font-medium">
            {apiInfo.baseUrl} <span className="text-muted-foreground">→ proxied to</span>{" "}
            {apiInfo.localApiHint}
          </dd>
          <dt className="text-muted-foreground">Last API error</dt>
          <dd className="break-all font-medium">
            {lastError ? (
              <span>
                <span className="font-mono text-xs">
                  {lastError.method} {lastError.endpoint}
                  {lastError.status ? ` → HTTP ${lastError.status}` : ""}
                </span>
                <br />
                {lastError.message}
              </span>
            ) : (
              "None this session"
            )}
          </dd>
        </dl>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void testHealth()}>
            Test API Health
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void testFacebookEndpoint()}
          >
            Test Facebook Launch Endpoint
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void testSyncEndpoint()}
          >
            Test Joined Groups Sync Endpoint
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void testImportEndpoint()}
          >
            Test Import Preview Endpoint
          </Button>
          {lastError ? (
            <Button variant="ghost" size="sm" onClick={() => clearLastApiError()}>
              Clear last error
            </Button>
          ) : null}
        </div>

        {probe ? (
          <Alert variant={probe.ok ? "default" : "destructive"}>
            <AlertDescription>
              <span className="font-medium">{probe.name}:</span> {probe.ok ? "PASS" : "FAIL"} —{" "}
              {probe.detail}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

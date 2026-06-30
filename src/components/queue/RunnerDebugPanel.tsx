import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RunnerDiagnostics } from "@/types";

const rows: Array<{ label: string; key: keyof RunnerDiagnostics; fallback: string }> = [
  { label: "Runner status", key: "runnerStatus", fallback: "idle" },
  { label: "Current URL", key: "currentUrl", fallback: "Not opened yet" },
  { label: "Page title", key: "pageTitle", fallback: "None" },
  { label: "Last detected state", key: "lastDetectedState", fallback: "None" },
  { label: "Working selector", key: "lastWorkingSelector", fallback: "None" },
  { label: "Selector attempts", key: "lastSelectorAttemptSummary", fallback: "None" },
  { label: "Last error", key: "lastError", fallback: "None" },
  { label: "Last screenshot path", key: "lastScreenshotPath", fallback: "None" },
  { label: "HTML snippet path", key: "lastHtmlSnippetPath", fallback: "None" },
  { label: "Debug record", key: "lastDebugRecordPath", fallback: "None" },
];

export function RunnerDebugPanel({ diagnostics }: { diagnostics: RunnerDiagnostics }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Runner Debug Panel</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[180px_1fr] gap-y-2 text-sm">
          {rows.map(({ label, key, fallback }) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd>
                <code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">
                  {diagnostics[key] || fallback}
                </code>
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

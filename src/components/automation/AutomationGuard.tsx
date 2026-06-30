import { AlertTriangle } from "lucide-react";
import { useSessionStatus } from "@/hooks/use-api";

// While the runner is actively driving its own browser window, non-technical
// users tend to click into that window or close it — which kills the post
// mid-flight ("sometimes it x'es out"). This is an always-on, unmissable bar
// that tells them to leave it alone until it finishes. It only shows during
// active automation (runnerStatus === "running"); it disappears the moment the
// runner pauses, finishes, or hands control back for human review.
export function AutomationGuard() {
  const { data: status } = useSessionStatus({ poll: true });
  const runnerStatus = status?.diagnostics?.runnerStatus;
  if (runnerStatus !== "running") return null;

  const currentName = status?.currentGroup?.name;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[90] border-t-2 border-amber-500 bg-amber-500/95 text-amber-950 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]">
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-700 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-700" />
        </span>
        <AlertTriangle className="h-5 w-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-tight">
            Automation is running — don&apos;t touch the browser window it opened.
          </p>
          <p className="truncate text-xs leading-tight">
            A separate browser window is posting for you
            {currentName ? ` (now: ${currentName})` : ""}. Don&apos;t click, type, or close it — it
            finishes on its own. Touching it can stop the post.
          </p>
        </div>
      </div>
    </div>
  );
}

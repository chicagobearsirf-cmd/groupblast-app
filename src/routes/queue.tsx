import { createFileRoute, Link } from "@tanstack/react-router";
import {
  CheckCheck,
  CheckCircle2,
  ExternalLink,
  ListTodo,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  SkipForward,
  Square,
  StepForward,
  XCircle,
  XOctagon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { StatusBadge } from "@/components/groups/GroupStatusBadge";
import { ResultsTable } from "@/components/history/ResultsTable";
import { RunnerDebugPanel } from "@/components/queue/RunnerDebugPanel";
import { EmptyState } from "@/components/layout/EmptyState";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { useForceStop, useSessionAction, useSessionStatus, useSettings } from "@/hooks/use-api";
import type { SessionAction } from "@/types";

export const Route = createFileRoute("/queue")({
  component: QueuePage,
});

function QueuePage() {
  const { data: status } = useSessionStatus();
  const { data: settings } = useSettings();
  const sessionAction = useSessionAction(status?.session?.id);
  const forceStop = useForceStop();

  if (!status) {
    return <p className="text-sm text-muted-foreground">Loading session status…</p>;
  }

  if (!status.session) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Queue / Session</h1>
        <EmptyState
          title="No session queued"
          text="Use the Post Composer to create a session first."
        />
        <div>
          <Button asChild>
            <Link to="/compose">Open Post Composer</Link>
          </Button>
        </div>
      </div>
    );
  }

  const act = (action: SessionAction, successMessage: string) => {
    if (
      action === "start" &&
      settings?.facebookSessionStatus !== "logged_in" &&
      !window.confirm("No successful Facebook session check is recorded. Start anyway?")
    ) {
      return;
    }
    sessionAction.mutate({ action, successMessage });
  };

  const progressValue = status.totalCount
    ? Math.min(100, Math.round((status.session.currentIndex / status.totalCount) * 100))
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Queue / Session</h1>
        <StatusBadge
          status={status.session.state === "running" ? "active" : "needs_review"}
          label={status.session.state}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current Session</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                {status.currentGroup?.name ?? "Session complete"}
              </h2>
              {status.currentGroup ? (
                <a
                  href={status.currentGroup.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-muted-foreground hover:underline"
                >
                  {status.currentGroup.url}
                </a>
              ) : null}
              {status.nextGroup ? (
                <p className="mt-1 text-xs text-muted-foreground">Next: {status.nextGroup.name}</p>
              ) : null}
            </div>
            <div className="w-full max-w-xs">
              <Progress value={progressValue} />
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {status.session.currentIndex}/{status.totalCount}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatsCard
              title="Posted"
              value={status.counts.posted}
              icon={CheckCheck}
              description="Confirmed by user"
            />
            <StatsCard
              title="Skipped"
              value={status.counts.skipped}
              icon={SkipForward}
              description="Moved past"
            />
            <StatsCard
              title="Failed"
              value={status.counts.failed}
              icon={XOctagon}
              description="Logged failures"
            />
            <StatsCard
              title="Needs Review"
              value={status.counts.needs_review}
              icon={ShieldAlert}
              description="Manual attention"
            />
            <StatsCard
              title="Remaining"
              value={status.remainingCount}
              icon={ListTodo}
              description="Groups left"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => act("start", "Session started.")}>
              <Play className="mr-2 h-4 w-4" /> Start
            </Button>
            <Button variant="outline" onClick={() => act("pause", "Session paused.")}>
              <Pause className="mr-2 h-4 w-4" /> Pause
            </Button>
            <Button variant="outline" onClick={() => act("resume", "Session resumed.")}>
              <Play className="mr-2 h-4 w-4" /> Resume
            </Button>
            <Button variant="outline" onClick={() => act("skip", "Skipped current group.")}>
              <SkipForward className="mr-2 h-4 w-4" /> Skip
            </Button>
            <Button
              variant="outline"
              onClick={() => act("continue-next", "Continued to next group.")}
            >
              <StepForward className="mr-2 h-4 w-4" /> Continue Next
            </Button>
            <Button variant="outline" onClick={() => act("open-current", "Current group opened.")}>
              <ExternalLink className="mr-2 h-4 w-4" /> Open Current Group
            </Button>
            <Button
              variant="outline"
              onClick={() => act("retry-current", "Retrying current group.")}
            >
              <RotateCcw className="mr-2 h-4 w-4" /> Retry This Group
            </Button>
            <Button
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={() => act("mark-posted", "Marked posted.")}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Posted
            </Button>
            <Button variant="destructive" onClick={() => act("mark-failed", "Marked failed.")}>
              <XCircle className="mr-2 h-4 w-4" /> Mark Failed
            </Button>
            <Button
              variant="outline"
              className="border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300"
              onClick={() => act("mark-pending-admin-review", "Marked pending admin review.")}
            >
              <ShieldAlert className="mr-2 h-4 w-4" /> Mark Pending Admin Review
            </Button>
            <Button variant="outline" onClick={() => act("stop", "Session stopped.")}>
              <Square className="mr-2 h-4 w-4" /> Stop
            </Button>
            <Button
              variant="destructive"
              disabled={forceStop.isPending}
              onClick={() => forceStop.mutate()}
              title="Use this if the app is stuck and won't start a new queue (e.g. after closing the browser mid-run). Clears everything and closes the automation browser."
            >
              <XOctagon className="mr-2 h-4 w-4" /> Force Stop / Reset
            </Button>
          </div>

          <Alert>
            <AlertTitle>How human-review posting works</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 pl-4">
                <li>
                  Human-review mode <strong>does not auto-post</strong>, and{" "}
                  <strong>does not know you posted unless you mark the result</strong>.
                </li>
                <li>
                  The app opens each group and fills the composer, then stops at{" "}
                  <strong>ready for manual review</strong>. It does not submit or judge approval
                  status on its own.
                </li>
                <li>
                  After you <strong>click Post in Facebook yourself</strong>: click{" "}
                  <strong>Mark Posted</strong> if it went live.
                </li>
                <li>
                  If Facebook says your post is <strong>pending approval</strong>, click{" "}
                  <strong>Mark Pending Admin Review</strong> (this saves a screenshot as evidence).
                </li>
                <li>
                  Otherwise use <strong>Skip</strong> or <strong>Mark Failed</strong>. The app never
                  claims a post was made or pending without your confirmation.
                </li>
              </ul>
            </AlertDescription>
          </Alert>
          {status.diagnostics.runnerStatus === "waiting_for_human" ? (
            <Alert>
              <AlertTitle>Ready for manual review</AlertTitle>
              <AlertDescription>
                The composer is filled but <strong>nothing has been submitted</strong>. Review the
                post in the browser, post it on Facebook yourself, then mark the result: Mark
                Posted, Mark Pending Admin Review, Skip, or Mark Failed.
              </AlertDescription>
            </Alert>
          ) : null}
          {settings?.facebookSessionStatus !== "logged_in" ? (
            <Alert variant="destructive">
              <AlertDescription>
                No successful Facebook session check is recorded. Run Check Facebook Session in
                Settings before starting a real queue.
              </AlertDescription>
            </Alert>
          ) : null}
          {status.totalCount === 1 ? (
            <Alert>
              <AlertDescription>One-group test queue active.</AlertDescription>
            </Alert>
          ) : null}
          {status.totalCount > 5 ? (
            <Alert variant="destructive">
              <AlertDescription>
                This queue contains more than 5 groups. Stop and run a one-group test first if this
                is a new browser/profile setup.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Session Results</CardTitle>
        </CardHeader>
        <CardContent>
          <ResultsTable results={status.results} />
        </CardContent>
      </Card>

      <RunnerDebugPanel diagnostics={status.diagnostics} />
    </div>
  );
}

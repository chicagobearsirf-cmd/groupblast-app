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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/groups/GroupStatusBadge";
import { ResultsTable } from "@/components/history/ResultsTable";
import { EmptyState } from "@/components/layout/EmptyState";
import { ErrorState } from "@/components/layout/ErrorState";
import { StatsCard } from "@/components/dashboard/StatsCard";
import {
  useCancelAllScheduledPosts,
  useCancelScheduledPost,
  useForceStop,
  useScheduledPosts,
  useSessionAction,
  useSessionStatus,
  useSettings,
} from "@/hooks/use-api";
import type { ScheduledPost, SessionAction } from "@/types";

export const Route = createFileRoute("/queue")({
  component: QueuePage,
});

function QueuePage() {
  const { data: status, isLoading, isError, refetch } = useSessionStatus();
  const {
    data: scheduledPosts = [],
    isLoading: scheduledLoading,
    isError: scheduledError,
    refetch: refetchScheduledPosts,
  } = useScheduledPosts();
  const { data: settings } = useSettings();
  const sessionAction = useSessionAction(status?.session?.id);
  const forceStop = useForceStop();
  const cancelScheduledPost = useCancelScheduledPost();
  const cancelAllScheduledPosts = useCancelAllScheduledPosts();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading session status…</p>;
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Scheduled</h1>
        <ErrorState
          title="Can't reach the local API"
          text="The queue status could not load from the local automation service."
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Scheduled</h1>
        <ScheduledPostsPanel
          posts={scheduledPosts}
          isLoading={scheduledLoading}
          isError={scheduledError}
          onRetry={() => void refetchScheduledPosts()}
          onCancel={(id) => cancelScheduledPost.mutate(id)}
          onCancelAll={() => cancelAllScheduledPosts.mutate()}
          canceling={cancelScheduledPost.isPending}
          cancelingAll={cancelAllScheduledPosts.isPending}
        />
      </div>
    );
  }

  if (!status.session) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">Scheduled</h1>
        <ScheduledPostsPanel
          posts={scheduledPosts}
          isLoading={scheduledLoading}
          isError={scheduledError}
          onRetry={() => void refetchScheduledPosts()}
          onCancel={(id) => cancelScheduledPost.mutate(id)}
          onCancelAll={() => cancelAllScheduledPosts.mutate()}
          canceling={cancelScheduledPost.isPending}
          cancelingAll={cancelAllScheduledPosts.isPending}
        />
        <div>
          <Button asChild>
            <Link to="/compose">Go to New Post</Link>
          </Button>
        </div>
      </div>
    );
  }

  const cooldownUntil =
    status.diagnostics.blockCooldownUntil ??
    (settings as { blockCooldownUntil?: string | null } | undefined)?.blockCooldownUntil ??
    null;
  const cooldownActive = isFutureDate(cooldownUntil);
  const act = (action: SessionAction, successMessage: string, overrideBlockCooldown = false) => {
    if (
      action === "start" &&
      settings?.facebookSessionStatus !== "logged_in" &&
      !window.confirm("No successful Facebook session check is recorded. Start anyway?")
    ) {
      return;
    }
    if (
      overrideBlockCooldown &&
      !window.confirm(
        "Posting before Facebook's limit is over can make the restriction last longer. Continue anyway?",
      )
    ) {
      return;
    }
    sessionAction.mutate({ action, successMessage, overrideBlockCooldown });
  };

  const progressValue = status.totalCount
    ? Math.min(100, Math.round((status.session.currentIndex / status.totalCount) * 100))
    : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Scheduled</h1>
        <StatusBadge
          status={status.session.state === "running" ? "active" : "needs_review"}
          label={status.session.state}
        />
      </div>

      <ScheduledPostsPanel
        posts={scheduledPosts}
        isLoading={scheduledLoading}
        isError={scheduledError}
        onRetry={() => void refetchScheduledPosts()}
        onCancel={(id) => cancelScheduledPost.mutate(id)}
        onCancelAll={() => cancelAllScheduledPosts.mutate()}
        canceling={cancelScheduledPost.isPending}
        cancelingAll={cancelAllScheduledPosts.isPending}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posting now</CardTitle>
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

          <div className="grid gap-3 sm:grid-cols-3">
            <StatsCard
              title="Posted"
              value={status.counts.posted}
              icon={CheckCheck}
              description="Done"
            />
            <StatsCard
              title="Remaining"
              value={status.remainingCount}
              icon={ListTodo}
              description="Groups left"
            />
            <StatsCard
              title="Needs Review"
              value={status.counts.needs_review}
              icon={ShieldAlert}
              description="Need attention"
            />
          </div>

          {cooldownActive ? (
            <BlockCooldownAlert
              cooldownUntil={cooldownUntil}
              isStarting={sessionAction.isPending}
              onOverride={() => act("start", "Started despite the Facebook limit.", true)}
            />
          ) : null}

          {/* Primary controls — the buttons users press most */}
          {!cooldownActive && status.session.state !== "running" && status.remainingCount > 0 ? (
            <div className="flex flex-col items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900 dark:bg-emerald-950/40 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                Ready to post to {status.remainingCount} group
                {status.remainingCount === 1 ? "" : "s"}. Click Start to begin.
              </p>
              <Button
                className="h-11 bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => act("start", "Started.")}
              >
                <Play className="mr-2 h-4 w-4" /> Start posting
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11"
              disabled={cooldownActive}
              onClick={() => act("start", "Started.")}
            >
              <Play className="mr-2 h-4 w-4" /> Start
            </Button>
            <Button className="h-11" variant="outline" onClick={() => act("pause", "Paused.")}>
              <Pause className="mr-2 h-4 w-4" /> Pause
            </Button>
            <Button className="h-11" variant="outline" onClick={() => act("resume", "Resumed.")}>
              <Play className="mr-2 h-4 w-4" /> Resume
            </Button>
            <Button className="h-11" variant="outline" onClick={() => act("skip", "Skipped.")}>
              <SkipForward className="mr-2 h-4 w-4" /> Skip
            </Button>
            <Button className="h-11" variant="outline" onClick={() => act("stop", "Stopped.")}>
              <Square className="mr-2 h-4 w-4" /> Stop
            </Button>
          </div>

          {/* Review actions — after you post in Facebook yourself */}
          <div className="rounded-md border p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              After you review a post in the browser:
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                onClick={() => act("mark-posted", "Marked posted.")}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> Mark Posted
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-800 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300"
                onClick={() => act("mark-pending-admin-review", "Marked pending review.")}
              >
                <ShieldAlert className="mr-2 h-4 w-4" /> Pending Approval
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => act("mark-failed", "Marked failed.")}
              >
                <XCircle className="mr-2 h-4 w-4" /> Mark Failed
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => act("open-current", "Opened current group.")}
              >
                <ExternalLink className="mr-2 h-4 w-4" /> Open Group
              </Button>
              <Button size="sm" variant="outline" onClick={() => act("retry-current", "Retrying.")}>
                <RotateCcw className="mr-2 h-4 w-4" /> Retry
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => act("continue-next", "Continued.")}
              >
                <StepForward className="mr-2 h-4 w-4" /> Next
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={forceStop.isPending}
                onClick={() => forceStop.mutate()}
                title="Use this if the app is stuck and won't start a new queue. Clears everything and closes the automation browser."
              >
                <XOctagon className="mr-2 h-4 w-4" /> Force Reset
              </Button>
            </div>
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
          {status.diagnostics.lastDetectedState === "daily_limit_reached" ? (
            <Alert>
              <AlertTitle>Done for today</AlertTitle>
              <AlertDescription>
                You've reached your daily posting limit ({settings?.maxPostsPerDay ?? 25} posts in
                24 hours), so GroupBlast stopped to protect your Facebook account. Your remaining
                groups are saved — press Start tomorrow to continue where you left off. You can
                adjust the limit in Settings, but we recommend keeping it at 25 or below.
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
          <CardTitle className="text-base">Results</CardTitle>
        </CardHeader>
        <CardContent>
          <ResultsTable results={status.results} />
        </CardContent>
      </Card>
    </div>
  );
}

function BlockCooldownAlert({
  cooldownUntil,
  isStarting,
  onOverride,
}: {
  cooldownUntil: string | null;
  isStarting: boolean;
  onOverride: () => void;
}) {
  const until = cooldownUntil ? new Date(cooldownUntil) : null;
  const untilLabel =
    until && !Number.isNaN(until.getTime())
      ? until.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "later";
  const remainingLabel = formatTimeRemaining(cooldownUntil);
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
      <ShieldAlert className="h-4 w-4" />
      <AlertTitle>Facebook has temporarily limited posting</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>
          GroupBlast paused everything to protect your account. You can post again after{" "}
          <strong>{untilLabel}</strong>
          {remainingLabel ? ` (${remainingLabel})` : ""}. Posting sooner risks a longer restriction.
        </p>
        <div>
          <Button
            size="sm"
            variant="outline"
            className="border-amber-700 bg-white text-amber-950 hover:bg-amber-100 dark:bg-transparent dark:text-amber-100"
            disabled={isStarting}
            onClick={onOverride}
          >
            I understand the risk, post anyway
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function ScheduledPostsPanel({
  posts,
  isLoading,
  isError,
  onRetry,
  onCancel,
  onCancelAll,
  canceling,
  cancelingAll,
}: {
  posts: ScheduledPost[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onCancel: (id: string) => void;
  onCancelAll: () => void;
  canceling: boolean;
  cancelingAll: boolean;
}) {
  const activeCount = posts.filter(
    (post) => post.status === "pending" || post.status === "processing",
  ).length;
  return (
    <Card>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base">Drip schedule</CardTitle>
        <Button
          size="sm"
          variant="outline"
          disabled={!activeCount || cancelingAll}
          onClick={onCancelAll}
        >
          Cancel all
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading scheduled posts…</p>
        ) : isError ? (
          <ErrorState
            title="Can't load scheduled posts"
            text="The local automation service could not return the drip schedule."
            onRetry={onRetry}
          />
        ) : posts.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {posts.map((post) => {
                const canCancel = post.status === "pending" || post.status === "processing";
                return (
                  <TableRow key={post.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatScheduledTime(post.scheduledFor)}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[360px] truncate font-medium">{post.groupName}</div>
                      {post.lastError ? (
                        <div className="max-w-[360px] truncate text-xs text-muted-foreground">
                          {post.lastError}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <ScheduledStatusBadge status={post.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {canCancel ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={canceling}
                          onClick={() => onCancel(post.id)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="flex flex-col gap-3">
            <EmptyState
              title="Nothing scheduled yet"
              text="Write a post on the New Post page to schedule it here."
            />
            <div>
              <Button asChild>
                <Link to="/compose">Go to New Post</Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScheduledStatusBadge({ status }: { status: ScheduledPost["status"] }) {
  if (status === "posted") return <Badge className="bg-emerald-600 text-white">Posted</Badge>;
  if (status === "failed") return <Badge variant="destructive">Failed</Badge>;
  if (status === "skipped") return <Badge variant="secondary">Skipped</Badge>;
  if (status === "canceled") return <Badge variant="outline">Canceled</Badge>;
  if (status === "processing") return <Badge>Posting now</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

function formatScheduledTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not scheduled";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function isFutureDate(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

function formatTimeRemaining(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const totalMinutes = Math.max(0, Math.ceil((date.getTime() - Date.now()) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min left`;
  if (minutes === 0) return `${hours} hr left`;
  return `${hours} hr ${minutes} min left`;
}

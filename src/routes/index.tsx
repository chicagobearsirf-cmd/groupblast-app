import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FileUp, Globe, LogIn, PenTool, Users, ListChecks, CheckCircle2 } from "lucide-react";
import { toast } from "@/lib/notify";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { StatusBadge } from "@/components/groups/GroupStatusBadge";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ApiErrorAlert } from "@/components/layout/ApiErrorAlert";
import { api } from "@/lib/api";
import {
  queryKeys,
  useGroups,
  useHistory,
  useInvalidate,
  useSessionStatus,
  useSettings,
} from "@/hooks/use-api";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: groups = [] } = useGroups();
  const { data: sessionStatus } = useSessionStatus();
  const { data: history } = useHistory();
  const { data: settings } = useSettings();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  const postedCount = history?.results.filter((r) => r.status === "posted").length ?? 0;
  const recentResults = history?.results.slice(0, 6) ?? [];
  const fbConnected = settings?.facebookSessionStatus === "active";

  const checkSession = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const response = await api.checkFacebookSession();
      await invalidate(queryKeys.settings);
      toast.success(`Facebook session: ${response.status}`);
    } catch (error) {
      setActionError(error);
      toast.error(error instanceof Error ? error.message : "Session check failed.");
    } finally {
      setBusy(false);
    }
  };

  const launchBrowser = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await api.launchLoginBrowser();
      toast.success("Opened the Facebook login window.");
    } catch (error) {
      setActionError(error);
      toast.error(error instanceof Error ? error.message : "Failed to launch browser.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Home</h1>
        <StatusBadge
          status={fbConnected ? "active" : "paused"}
          label={fbConnected ? "Facebook connected" : "Not connected"}
        />
      </div>

      {/* Step 1: connect Facebook */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 1 — Connect your Facebook</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              className="h-14 flex-1 gap-2"
              disabled={busy}
              onClick={() => void launchBrowser()}
              data-tour="launch-fb-browser"
            >
              <Globe className="h-5 w-5" />
              Open Facebook login
            </Button>
            <Button
              variant="outline"
              className="h-14 flex-1 gap-2"
              disabled={busy}
              onClick={() => void checkSession()}
              data-tour="check-fb-login"
            >
              {fbConnected ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <LogIn className="h-5 w-5" />}
              Check connection
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Click “Open Facebook login,” log into Facebook in the window that opens, then click
            “Check connection.” Being logged in on your normal browser does not count — use this
            window.
          </p>
        </CardContent>
      </Card>

      {/* Step 2: do the work */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Button asChild variant="outline" className="h-20 flex-col gap-2">
          <Link to="/import">
            <FileUp className="h-5 w-5" />
            Add Groups
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-20 flex-col gap-2">
          <Link to="/compose">
            <PenTool className="h-5 w-5" />
            New Post
          </Link>
        </Button>
      </div>

      {actionError ? <ApiErrorAlert error={actionError} title="Facebook action failed" /> : null}

      {/* Simple stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatsCard title="My Groups" value={groups.length} icon={Users} description="Saved groups" />
        <StatsCard
          title="In Queue"
          value={sessionStatus?.remainingCount ?? 0}
          icon={ListChecks}
          description="Waiting to post"
        />
        <StatsCard
          title="Posted"
          value={postedCount}
          icon={CheckCircle2}
          description="Successful posts"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {sessionStatus?.session ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Posting right now</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                <Progress
                  value={
                    sessionStatus.totalCount
                      ? Math.min(
                          100,
                          Math.round(
                            (sessionStatus.session.currentIndex / sessionStatus.totalCount) * 100,
                          ),
                        )
                      : 0
                  }
                />
                <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">Current</dt>
                  <dd className="truncate font-medium">
                    {sessionStatus.currentGroup?.name ?? "Waiting"}
                  </dd>
                  <dt className="text-muted-foreground">Posted</dt>
                  <dd className="font-medium">{sessionStatus.counts.posted}</dd>
                </dl>
                <Button asChild variant="outline" size="sm">
                  <Link to="/queue">Open Scheduled</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent posts</CardTitle>
          </CardHeader>
          <CardContent>
            {recentResults.length ? (
              <div className="flex flex-col gap-2">
                {recentResults.map((result) => (
                  <div key={result.id} className="flex items-center gap-3 text-sm">
                    <StatusBadge status={result.status} />
                    <span className="min-w-0 flex-1 truncate">{result.groupName}</span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(result.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No posts yet"
                text="Your posted groups will show up here once you run your first post."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

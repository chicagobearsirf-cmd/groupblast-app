import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileUp,
  FolderTree,
  Globe,
  History,
  ListChecks,
  LogIn,
  PenTool,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { toast } from "@/lib/notify";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { StatusBadge } from "@/components/groups/GroupStatusBadge";
import { EmptyState } from "@/components/layout/EmptyState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ApiHealthCard } from "@/components/dashboard/ApiHealthCard";
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

const firstTestChecklist = [
  "Open persistent Facebook browser from Settings",
  "Confirm logged in with Check Facebook Session",
  "Import 1-3 groups from the extension",
  "Select exactly one group",
  "Paste a harmless test post",
  "Start human-review mode",
  "Confirm composer filled",
  "Manually post or skip",
  "Verify the history log result",
];

function DashboardPage() {
  const { data: groups = [] } = useGroups();
  const { data: sessionStatus } = useSessionStatus();
  const { data: history } = useHistory();
  const { data: settings } = useSettings();
  const invalidate = useInvalidate();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);

  const activeGroups = groups.filter((group) => group.status === "active").length;
  const needsReview = groups.filter((group) => group.status === "needs_review").length;
  const syncedGroups = groups.filter(
    (group) => group.source === "facebook_joined_groups_sync",
  ).length;
  const categories = new Set(groups.map((group) => group.category || "Uncategorized")).size;
  const recentResults = history?.results.slice(0, 6) ?? [];

  const checkSession = async () => {
    setBusy(true);
    setActionError(null);
    try {
      const response = await api.checkFacebookSession();
      await invalidate(queryKeys.settings);
      toast.success(`Facebook session check: ${response.status}`);
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
      const response = await api.launchLoginBrowser();
      const profile =
        response.settings.browserMode === "imported_chrome_profile_snapshot"
          ? `imported snapshot (${response.settings.chromeProfileSnapshotProfileDirectory || "Default"})`
          : response.settings.browserProfilePath;
      toast.success(`Opened facebook.com using ${profile}`);
    } catch (error) {
      setActionError(error);
      toast.error(error instanceof Error ? error.message : "Failed to launch browser.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Local human-review command center · posting stays user-confirmed
          </p>
        </div>
        <StatusBadge
          status={sessionStatus?.session?.state === "running" ? "active" : "paused"}
          label={sessionStatus?.session?.state ?? "No session"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <StatsCard
          title="Total Groups"
          value={groups.length}
          icon={Users}
          description={`${activeGroups} active`}
        />
        <StatsCard
          title="Categories"
          value={categories}
          icon={FolderTree}
          description="Saved targeting buckets"
        />
        <StatsCard
          title="Synced Groups"
          value={syncedGroups}
          icon={RefreshCw}
          description="From joined-groups sync"
        />
        <StatsCard
          title="Current Queue"
          value={sessionStatus?.totalCount ?? 0}
          icon={ListChecks}
          description={`${sessionStatus?.remainingCount ?? 0} remaining`}
        />
        <StatsCard
          title="Sessions Logged"
          value={history?.sessions.length ?? 0}
          icon={History}
          description={`${history?.results.length ?? 0} results`}
        />
        <StatsCard
          title="Needs Review"
          value={needsReview}
          icon={ShieldAlert}
          description="Groups flagged for attention"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Button asChild variant="outline" className="h-20 flex-col gap-2">
          <Link to="/import">
            <FileUp className="h-5 w-5" />
            Import Groups
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-20 flex-col gap-2">
          <Link to="/import" hash="joined-groups-sync">
            <RefreshCw className="h-5 w-5" />
            Sync Joined Groups
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-20 flex-col gap-2">
          <Link to="/compose">
            <PenTool className="h-5 w-5" />
            New Post Session
          </Link>
        </Button>
        <Button
          variant="outline"
          className="h-20 flex-col gap-2"
          disabled={busy}
          onClick={() => void checkSession()}
          data-tour="check-fb-login"
        >
          <LogIn className="h-5 w-5" />
          Check FB Login
          {settings ? (
            <span className="text-xs text-muted-foreground">
              {settings.facebookSessionStatus.replace(/_/g, " ")}
            </span>
          ) : null}
        </Button>
        <Button
          variant="outline"
          className="h-20 flex-col gap-2"
          disabled={busy}
          onClick={() => void launchBrowser()}
          data-tour="launch-fb-browser"
        >
          <Globe className="h-5 w-5" />
          Launch FB Browser
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Being logged into Facebook in your normal Chrome tab does <strong>not</strong> log in the
        app&apos;s browser. The app launches its own Managed Playwright Profile or an Imported
        Chrome Profile Snapshot. To use your existing login, set it up in{" "}
        <Link to="/settings" className="underline">
          Settings
        </Link>{" "}
        (create a Facebook Automation Chrome profile, log in there, quit Chrome, import the
        snapshot, then Check FB Login).
      </p>

      {actionError ? <ApiErrorAlert error={actionError} title="Facebook action failed" /> : null}

      <ApiHealthCard />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">First Real Test</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              {firstTestChecklist.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Session Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            {sessionStatus?.session ? (
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
                  <dt className="text-muted-foreground">Next</dt>
                  <dd className="truncate font-medium">
                    {sessionStatus.nextGroup?.name ?? "None"}
                  </dd>
                  <dt className="text-muted-foreground">Posted</dt>
                  <dd className="font-medium">{sessionStatus.counts.posted}</dd>
                  <dt className="text-muted-foreground">Needs review</dt>
                  <dd className="font-medium">{sessionStatus.counts.needs_review}</dd>
                </dl>
                <Button asChild variant="outline" size="sm">
                  <Link to="/queue">Open Queue</Link>
                </Button>
              </div>
            ) : (
              <EmptyState
                title="No active queue"
                text="Create a queue from the Post Composer when your copy is ready."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Results</CardTitle>
          </CardHeader>
          <CardContent>
            {recentResults.length ? (
              <div className="flex flex-col gap-2">
                {recentResults.map((result) => (
                  <div key={result.id} className="flex items-center gap-3 text-sm">
                    <StatusBadge status={result.status} />
                    <span className="min-w-0 flex-1 truncate">{result.groupName}</span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {new Date(result.timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No history yet"
                text="Posted, skipped, failed, and review-needed groups will appear here."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

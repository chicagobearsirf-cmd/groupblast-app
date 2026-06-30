import { createFileRoute } from "@tanstack/react-router";
import { Activity, Building2, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/EmptyState";
import { CloudConfigWarning } from "@/components/layout/CloudConfigWarning";
import { useAuth } from "@/components/auth/auth-context";
import { getAppModeInfo } from "@/lib/app-mode";
import { getDataStore } from "@/lib/data/store";

export const Route = createFileRoute("/team")({
  component: TeamPage,
});

function TeamPage() {
  const { mode, cloudConfigured } = getAppModeInfo();
  const { user } = useAuth();
  const role = user?.role ?? "rep";
  const dataStore = getDataStore();
  const cloudReady = mode !== "local" && cloudConfigured;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-sm text-muted-foreground">
            Admin view of reps, activity, and shared data. Populated in cloud/hybrid mode.
          </p>
        </div>
        <Badge variant="secondary" className="capitalize">
          <ShieldCheck className="mr-1 h-3.5 w-3.5" />
          {role}
        </Badge>
      </div>

      <CloudConfigWarning />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              Team
            </CardTitle>
            <CardDescription>Your organization and its shared data.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[120px_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">App mode</dt>
              <dd className="font-medium capitalize">{mode}</dd>
              <dt className="text-muted-foreground">Data store</dt>
              <dd className="font-medium">{dataStore.kind}</dd>
              <dt className="text-muted-foreground">Your role</dt>
              <dd className="font-medium capitalize">{role}</dd>
              <dt className="text-muted-foreground">Cloud</dt>
              <dd className="font-medium">{cloudReady ? "Connected" : "Not configured"}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" />
              Reps
            </CardTitle>
            <CardDescription>Outreach users on your team.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              title={cloudReady ? "No reps yet" : "Reps need cloud mode"}
              text={
                cloudReady
                  ? "Invite reps; they'll appear here once they sign in."
                  : "Rep accounts live in Supabase. Enable cloud/hybrid mode to invite and manage reps."
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Rep activity
            </CardTitle>
            <CardDescription>Recent outreach across the team.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              title={cloudReady ? "No activity yet" : "Activity needs cloud mode"}
              text={
                cloudReady
                  ? "Rep sessions, posts, and results will stream here."
                  : "Per-rep activity syncs from each rep's local agent to the cloud (Phase 3)."
              }
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What admins will manage here</CardTitle>
          <CardDescription>Foundation now; wired up in later phases.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1.5 pl-5 text-sm text-muted-foreground sm:grid-cols-2 [&>li]:list-disc">
            <li>Invite/remove reps and set roles (admin / rep)</li>
            <li>Create campaigns and shared group lists</li>
            <li>Monitor each rep's sessions and results</li>
            <li>Review captured replies and leads</li>
            <li>See which reps have a live local agent / extension</li>
            <li>Team-scoped data isolation via Supabase RLS</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

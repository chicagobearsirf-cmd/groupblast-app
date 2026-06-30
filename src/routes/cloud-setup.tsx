import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Cloud, ServerCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CloudConfigWarning } from "@/components/layout/CloudConfigWarning";
import { useAuth } from "@/components/auth/auth-context";
import { getAppModeInfo } from "@/lib/app-mode";
import { getSupabaseClient, isSupabaseReady } from "@/lib/supabase";
import { getDataStore } from "@/lib/data/store";

export const Route = createFileRoute("/cloud-setup")({
  component: CloudSetupPage,
});

function CloudSetupPage() {
  const { mode, cloudConfigured } = getAppModeInfo();
  const { user, status } = useAuth();
  const [team, setTeam] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "local" || !user?.id) return;
    const client = getSupabaseClient();
    if (!client) return;
    let active = true;
    void (async () => {
      const member = await client
        .from("team_members")
        .select("team_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      const teamId = (member.data as { team_id?: string } | null)?.team_id;
      if (!teamId) {
        if (active) setTeam(null);
        return;
      }
      const t = await client.from("teams").select("name").eq("id", teamId).maybeSingle();
      if (active) setTeam((t.data as { name?: string } | null)?.name ?? teamId);
    })();
    return () => {
      active = false;
    };
  }, [mode, user?.id]);

  const rows: Array<[string, string]> = [
    ["Environment mode", mode],
    ["Supabase configured", cloudConfigured ? "Yes" : "No"],
    ["Connection", isSupabaseReady() ? "Client ready" : "Not connected"],
    [
      "Signed in",
      mode === "local"
        ? "Local operator (no sign-in)"
        : status === "loading"
          ? "Checking…"
          : user
            ? (user.email ?? "Yes")
            : "No",
    ],
    ["Role", user?.role ?? "—"],
    ["Team", mode === "local" ? "Local (n/a)" : (team ?? "Not assigned")],
    ["Data store", getDataStore().kind],
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Cloud Setup</h1>
        <p className="text-sm text-muted-foreground">
          Supabase connection, your account, and environment mode.
        </p>
      </div>

      <CloudConfigWarning />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Cloud className="h-4 w-4" />
            Connection status
          </CardTitle>
          <CardDescription>What the app is connected to right now.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-[160px_1fr] gap-y-2 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-medium capitalize">{value}</dd>
              </div>
            ))}
          </dl>

          {mode !== "local" && status !== "loading" && !user ? (
            <div className="flex gap-2">
              <Button asChild size="sm">
                <Link to="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link to="/signup">Create account</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ServerCog className="h-4 w-4" />
            What reps still run locally
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            Cloud handles accounts, teams, and shared data. Facebook automation (browser launch,
            session check, joined-group sync, composer filling) always runs on the rep's own machine
            via the local agent (<code>npm run dev</code>). See{" "}
            <Link to="/setup" className="underline">
              Rep Setup
            </Link>{" "}
            and <code>docs/CLOUD_ARCHITECTURE.md</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

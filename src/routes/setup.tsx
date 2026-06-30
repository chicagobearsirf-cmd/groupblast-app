import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Chrome,
  Cloud,
  Download,
  FolderInput,
  LogIn,
  PenTool,
  RefreshCw,
  ServerCog,
  UserPlus,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CloudConfigWarning } from "@/components/layout/CloudConfigWarning";
import { getAppModeInfo } from "@/lib/app-mode";

export const Route = createFileRoute("/setup")({
  component: RepSetupPage,
});

type Step = {
  icon: typeof UserPlus;
  title: string;
  body: React.ReactNode;
  action?: { label: string; to: string; hash?: string };
};

const steps: Step[] = [
  {
    icon: UserPlus,
    title: "Create your rep account",
    body: "In cloud/hybrid mode you'll sign in with your own rep account so your data syncs to the shared dashboard. In local mode you're the operator on this machine — no sign-in needed.",
  },
  {
    icon: Download,
    title: "Download the Chrome extension",
    body: "The Facebook Group Capture extension lets you save group names + URLs while you browse. Install it in the Chrome profile you'll use for outreach.",
    action: { label: "Go to Extension", to: "/extension" },
  },
  {
    icon: Chrome,
    title: 'Create a Chrome profile named "Facebook Automation"',
    body: "Make a dedicated Chrome profile just for outreach (Chrome → profile menu → Add). Keeping it separate protects your normal browsing and gives the local agent a clean profile to snapshot.",
  },
  {
    icon: LogIn,
    title: "Log into Facebook manually",
    body: "In that new profile, log into Facebook yourself. The app never automates login and never bypasses security/checkpoints — that's always you.",
  },
  {
    icon: FolderInput,
    title: "Import profile snapshot / run the local agent",
    body: "Quit Chrome, then run the local agent and import a snapshot of that profile. Playwright only ever drives the local snapshot copy, never your live Chrome.",
    action: { label: "Open Settings", to: "/settings" },
  },
  {
    icon: RefreshCw,
    title: "Sync your joined groups",
    body: "Use the local agent to read the groups you've already joined (or import a CSV/JSON from the extension). Nothing is saved until you confirm the preview.",
    action: { label: "Go to Import / Sync", to: "/import", hash: "joined-groups-sync" },
  },
  {
    icon: PenTool,
    title: "Start human-review outreach",
    body: "Paste your post, pick groups, and run a one-group test first. The app fills the composer and stops — you post on Facebook yourself, then mark the result. It never auto-posts.",
    action: { label: "Open Composer", to: "/compose" },
  },
];

function RepSetupPage() {
  const { mode, localAutomationAvailable } = getAppModeInfo();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Rep Setup</h1>
        <p className="text-sm text-muted-foreground">
          Get a rep onboarded end to end. Facebook automation runs on the rep's own machine — the
          cloud dashboard never touches Facebook.
        </p>
      </div>

      <CloudConfigWarning />

      {!localAutomationAvailable ? (
        <Alert variant="destructive">
          <Cloud className="h-4 w-4" />
          <AlertTitle>This is a cloud-only build</AlertTitle>
          <AlertDescription>
            App mode is <code>{mode}</code>, so Facebook automation (browser launch, session check,
            group sync, composer) is not available here. Reps must run the local agent (
            <code>npm run dev</code>) on their own computer for steps 5–7.
          </AlertDescription>
        </Alert>
      ) : null}

      <ol className="flex flex-col gap-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Badge variant="secondary" className="h-6 min-w-6 justify-center">
                    {index + 1}
                  </Badge>
                  <step.icon className="h-4 w-4" />
                  {step.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm text-muted-foreground">{step.body}</p>
                {step.action ? (
                  <div>
                    <Button asChild variant="outline" size="sm">
                      <Link to={step.action.to} hash={step.action.hash}>
                        {step.action.label}
                      </Link>
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ServerCog className="h-4 w-4" />
            Why each rep needs a local agent
          </CardTitle>
          <CardDescription>
            The hosted dashboard holds shared data; anything that touches Facebook runs locally.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            The local agent (the Express API + Playwright in this repo) is the only thing that can:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>launch the Facebook browser,</li>
            <li>check the Facebook session,</li>
            <li>sync joined groups,</li>
            <li>fill the post composer for human review.</li>
          </ul>
          <p>
            The cloud cannot do these — it has no browser and no access to your Facebook session,
            and running automation from a datacenter would look like spam. See{" "}
            <code>docs/CLOUD_ARCHITECTURE.md</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

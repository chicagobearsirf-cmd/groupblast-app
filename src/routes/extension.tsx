import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, FileUp, Puzzle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useExtensionInfo } from "@/hooks/use-api";

export const Route = createFileRoute("/extension")({
  component: ExtensionPage,
});

const installSteps = [
  "Click Download Chrome Extension to save the ZIP.",
  "Unzip it — you get a facebook-group-capture-extension folder.",
  "Open chrome://extensions in Chrome.",
  "Turn on Developer Mode (top-right toggle).",
  "Click Load Unpacked.",
  "Select the unzipped facebook-group-capture-extension folder.",
  "Pin Facebook Group Capture from the puzzle-piece menu so it stays visible.",
];

function ExtensionPage() {
  const { data: info, error } = useExtensionInfo();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Chrome Extension</h1>
        <p className="text-sm text-muted-foreground">
          Facebook Group Capture — save group names and URLs while you browse, then import them
          here.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          <strong>Each rep installs this in their own Chrome.</strong> Download it from the cloud
          dashboard, then load it (unpacked) into the dedicated <strong>Facebook Automation</strong>{" "}
          Chrome profile on that rep&apos;s computer — the same profile they log into Facebook with.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Puzzle className="h-4 w-4" />
            Facebook Group Capture
          </CardTitle>
          <CardDescription>
            A manual capture tool: with a Facebook group tab open, click the extension, confirm the
            group name and URL, assign category/subcategory/tags/status/notes, and save. It stores
            everything locally in the browser and exports JSON or CSV for this command center. It
            never joins groups, posts, scrapes feeds, or automates Facebook.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <a href="/api/extension/download" download>
                <Download className="h-4 w-4" />
                Download Chrome Extension
              </a>
            </Button>
            {info ? (
              <Badge variant="secondary">
                {info.name}
                {info.version ? ` v${info.version}` : ""}
              </Badge>
            ) : null}
            {info ? <Badge variant="outline">{info.zipFileName}</Badge> : null}
          </div>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>
                Could not reach the local API for extension info:{" "}
                {error instanceof Error ? error.message : String(error)}. Start the app with{" "}
                <code>npm run dev</code> and reload.
              </AlertDescription>
            </Alert>
          ) : null}
          {info && !info.available ? (
            <Alert variant="destructive">
              <AlertDescription>
                The extension folder is missing from this checkout (expected at {info.extensionPath}
                ). Pull the latest repo so extensions/facebook-group-capture-extension exists.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-medium">
                Install (each rep, on their own computer)
              </h3>
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                {installSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <h3 className="mb-2 text-sm font-medium">Running locally? Skip the ZIP</h3>
                <p className="text-sm text-muted-foreground">
                  The extension ships inside this repo, so you can point Load Unpacked straight at
                  the folder:
                </p>
                <p className="mt-1.5 break-all rounded-md border bg-muted/40 p-2 font-mono text-xs">
                  {info?.extensionPath ?? "extensions/facebook-group-capture-extension"}
                </p>
              </div>
              {info?.files.length ? (
                <div>
                  <h3 className="mb-1 text-sm font-medium">Included files</h3>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {info.files.join(" · ")}
                  </p>
                </div>
              ) : null}
              <div>
                <h3 className="mb-1 text-sm font-medium">Re-package after changes</h3>
                <p className="text-sm text-muted-foreground">
                  <code>npm run package:extension</code> writes{" "}
                  <code>dist/facebook-group-capture-extension.zip</code>.
                  {info && !info.zipExists ? (
                    <span className="ml-1 text-amber-600 dark:text-amber-400">
                      ZIP not found — run this before sharing the download link.
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Works with the command center import</CardTitle>
          <CardDescription>
            Export JSON, Export CSV, and Copy JSON in the extension all produce formats the Import
            page accepts (name, url, category, subcategory, tags, status, notes, source, capturedAt,
            updatedAt). Duplicate URLs update existing groups instead of creating copies.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/import">
              <FileUp className="h-4 w-4" />
              Go to Import Groups
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

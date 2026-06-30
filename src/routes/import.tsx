import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "@/lib/notify";
import { FilePlus2, Files, FileWarning, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { StatsCard } from "@/components/dashboard/StatsCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImportPreviewTable } from "@/components/import/ImportPreviewTable";
import { ApiErrorAlert } from "@/components/layout/ApiErrorAlert";
import { LocalDataNotice } from "@/components/layout/LocalDataNotice";
import { api } from "@/lib/api";
import { queryKeys, useGroups, useInvalidate } from "@/hooks/use-api";
import type {
  ImportFormat,
  ImportPreview,
  ImportPreviewRow,
  ImportResult,
  JoinedGroupsSyncStatus,
} from "@/types";

export const Route = createFileRoute("/import")({
  component: ImportPage,
});

function ImportPage() {
  const invalidate = useInvalidate();
  const { data: groups = [] } = useGroups();
  const [importMode, setImportMode] = useState<"extension" | "generic">("extension");
  const [format, setFormat] = useState<ImportFormat>("auto");
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [syncStatus, setSyncStatus] = useState<JoinedGroupsSyncStatus | null>(null);
  const [syncResult, setSyncResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const activeFormat: ImportFormat = importMode === "extension" ? "auto" : format;
  const syncPreview = useMemo<ImportPreview | null>(() => {
    if (!syncStatus?.rows.length) return null;
    const existingUrls = new Set(groups.map((group) => group.url.replace(/\/$/, "")));
    const seenUrls = new Set<string>();
    let duplicateCount = 0;
    let newCount = 0;
    let updatedCount = 0;
    const rows = syncStatus.rows.map((row) => {
      const normalizedUrl = row.url.replace(/\/$/, "");
      const duplicateInRun = seenUrls.has(normalizedUrl);
      const exists = existingUrls.has(normalizedUrl);
      seenUrls.add(normalizedUrl);
      if (duplicateInRun || exists) duplicateCount += 1;
      if (exists) updatedCount += 1;
      if (!exists && !duplicateInRun) newCount += 1;
      const importAction: ImportPreviewRow["importAction"] = exists
        ? "update"
        : duplicateInRun
          ? "duplicate"
          : "create";
      return {
        name: row.name,
        url: row.url,
        category: row.category,
        subcategory: row.subcategory,
        tags: row.tags,
        notes: row.notes,
        source: row.source,
        sourceCapturedAt: row.capturedAt,
        sourceUpdatedAt: row.updatedAt,
        importAction,
      };
    });
    return {
      rows,
      totalRows: syncStatus.groupsFound,
      duplicateCount: syncStatus.duplicateCount || duplicateCount,
      newCount: syncStatus.newCount || newCount,
      updatedCount: syncStatus.updatedCount || updatedCount,
    };
  }, [groups, syncStatus]);

  useEffect(() => {
    void api
      .joinedGroupsSyncStatus()
      .then(setSyncStatus)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (syncStatus?.state !== "running") return undefined;
    const timer = window.setInterval(() => {
      void api
        .joinedGroupsSyncStatus()
        .then(setSyncStatus)
        .catch(() => undefined);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [syncStatus?.state]);

  const previewImport = async (nextContent = content) => {
    setBusy(true);
    setImportError(null);
    setActionError(null);
    try {
      const result = await api.importPreview(nextContent, activeFormat);
      if (import.meta.env.DEV) console.log("[import preview]", result);
      setPreview(result);
      setResult(null);
      if (result.totalRows === 0) {
        setImportError(
          "No rows were parsed from the import content. " +
            "For CSV, check that the first row is a header with these exact column names: " +
            "name, url, category, subcategory, tags, status, notes, source, capturedAt, updatedAt. " +
            "For JSON, paste the array from the extension's Copy JSON or Export JSON.",
        );
      }
    } catch (error) {
      setActionError(error);
      toast.error(error instanceof Error ? error.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  };

  const importGroups = async () => {
    setBusy(true);
    setImportError(null);
    setActionError(null);
    try {
      const response = await api.importGroups(content, activeFormat);
      setResult(response);
      setPreview(null);
      if (response.imported === 0) {
        setImportError(
          "Import finished but 0 rows were processed. " +
            "Run Preview first to confirm the CSV or JSON is parsed correctly.",
        );
      } else {
        await invalidate(queryKeys.groups, queryKeys.collections);
        toast.success(`Import finished: ${response.imported} rows processed.`);
      }
    } catch (error) {
      setActionError(error);
      toast.error(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setContent(text);
    setImportError(null);
    await previewImport(text);
  };

  const loadSampleCsv = () => {
    const sample = [
      "name,url,category,subcategory,tags,status,notes,source,capturedAt,updatedAt",
      "Austin Business Networking,https://www.facebook.com/groups/1044024556607189/,General,,,active,,facebook_group_capture_extension,2026-06-12T00:24:58.057Z,",
      '"Real Estate Buyers, Investors, Agents",https://www.facebook.com/groups/RealEstateCashBuyersClub,General,,,active,,facebook_group_capture_extension,2026-06-12T00:36:44.080Z,2026-06-12T00:36:44.080Z',
    ].join("\n");
    setContent(sample);
    setImportError(null);
    setPreview(null);
    setResult(null);
  };

  const startGroupSync = async () => {
    setSyncBusy(true);
    setSyncResult(null);
    setActionError(null);
    try {
      setSyncStatus(await api.startJoinedGroupsSync());
      toast.success("Joined groups sync started.");
    } catch (error) {
      setActionError(error);
      toast.error(error instanceof Error ? error.message : "Group sync failed to start.");
    } finally {
      setSyncBusy(false);
    }
  };

  const stopGroupSync = async () => {
    setSyncBusy(true);
    setActionError(null);
    try {
      setSyncStatus(await api.stopJoinedGroupsSync());
    } catch (error) {
      setActionError(error);
      toast.error(error instanceof Error ? error.message : "Group sync stop failed.");
    } finally {
      setSyncBusy(false);
    }
  };

  const confirmGroupSyncImport = async () => {
    setSyncBusy(true);
    setActionError(null);
    try {
      const response = await api.confirmJoinedGroupsSyncImport();
      setSyncResult(response);
      setSyncStatus(await api.joinedGroupsSyncStatus());
      await invalidate(queryKeys.groups, queryKeys.collections);
      toast.success(`Imported ${response.imported} synced groups.`);
    } catch (error) {
      setActionError(error);
      toast.error(error instanceof Error ? error.message : "Synced group import failed.");
    } finally {
      setSyncBusy(false);
    }
  };

  const syncRunning = syncStatus?.state === "running";
  const syncReady =
    (syncStatus?.state === "ready" || syncStatus?.state === "stopped") &&
    Boolean(syncStatus.rows.length);
  const syncProgress =
    syncStatus && syncStatus.maxGroups > 0
      ? Math.min(100, Math.round((syncStatus.groupsFound / syncStatus.maxGroups) * 100))
      : 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Import Groups</h1>
        <p className="text-sm text-muted-foreground">
          Bring in groups from the capture extension or any CSV/JSON export. URL is the unique key —
          duplicate URLs update the existing group.
        </p>
      </div>

      <LocalDataNotice />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Import from Facebook Group Capture Extension</CardTitle>
          <CardDescription>
            Upload a JSON/CSV export from the extension or paste copied JSON. The importer
            auto-detects the extension format and preserves category, subcategory, status, source,
            and captured timestamps.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="flex flex-col gap-3">
              <div className="grid gap-1.5">
                <Label>Import source</Label>
                <Select
                  value={importMode}
                  onValueChange={(mode) => {
                    setImportMode(mode as "extension" | "generic");
                    setPreview(null);
                    setResult(null);
                    setImportError(null);
                    setActionError(null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="extension">Facebook Group Capture Extension</SelectItem>
                    <SelectItem value="generic">Generic CSV/JSON</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {importMode === "generic" ? (
                <div className="grid gap-1.5">
                  <Label>Format</Label>
                  <Select value={format} onValueChange={(next) => setFormat(next as ImportFormat)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                      <SelectItem value="json">JSON array</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label htmlFor="import-file">Upload export file</Label>
                <Input
                  id="import-file"
                  type="file"
                  accept=".json,.csv,.txt,application/json,text/csv,text/plain"
                  onChange={(event) => void loadFile(event.target.files?.[0])}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Extension fields supported: name, url, category, subcategory, tags, status, notes,
                source, capturedAt, updatedAt, plus older group_name/group_url/niche query exports.
                Generic CSV supports groupName, groupUrl, category, tags, notes with flexible
                name/url headers.
              </p>
            </div>
            <Textarea
              className="min-h-[220px] font-mono text-xs"
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                setPreview(null);
                setResult(null);
                setImportError(null);
                setActionError(null);
              }}
              placeholder={
                importMode === "extension"
                  ? "Paste JSON from Copy JSON, or CSV from Export CSV.\nCSV: name,url,category,subcategory,tags,status,notes,source,capturedAt,updatedAt"
                  : "groupName,groupUrl,category,tags,notes"
              }
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!content.trim() || busy}
              onClick={() => void previewImport()}
            >
              Preview import
            </Button>
            <Button disabled={!content.trim() || busy} onClick={() => void importGroups()}>
              Import groups
            </Button>
            <Button variant="ghost" size="sm" onClick={loadSampleCsv}>
              Load sample CSV
            </Button>
          </div>
          {actionError ? <ApiErrorAlert error={actionError} title="Import request failed" /> : null}
          {importError ? (
            <Alert variant="destructive">
              <AlertDescription>{importError}</AlertDescription>
            </Alert>
          ) : null}
          {preview ? <ImportPreviewTable preview={preview} /> : null}
          {result && result.imported > 0 ? (
            <Alert>
              <AlertDescription>
                Imported {result.imported}. Created {result.created}. Updated {result.updated}.
                Duplicates {result.duplicateCount}.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card id="joined-groups-sync">
        <CardHeader>
          <CardTitle className="text-base">Sync Joined Facebook Groups</CardTitle>
          <CardDescription>
            Uses the visible Playwright Facebook session to scroll your joined-groups page and read
            group names and URLs you can already access. Nothing is saved until you confirm the
            preview.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button disabled={syncBusy || syncRunning} onClick={() => void startGroupSync()}>
              Start Group Sync
            </Button>
            <Button
              variant="outline"
              disabled={syncBusy || !syncRunning}
              onClick={() => void stopGroupSync()}
            >
              Stop
            </Button>
            <Button disabled={syncBusy || !syncReady} onClick={() => void confirmGroupSyncImport()}>
              Confirm Import
            </Button>
          </div>

          {syncStatus ? (
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatsCard
                  title="Groups found"
                  value={syncStatus.groupsFound}
                  icon={Files}
                  description={`Pass ${syncStatus.currentPass}`}
                />
                <StatsCard
                  title="New groups"
                  value={syncStatus.newCount}
                  icon={FilePlus2}
                  description="Will be created"
                />
                <StatsCard
                  title="Updated groups"
                  value={syncStatus.updatedCount}
                  icon={RefreshCw}
                  description="Existing URLs"
                />
                <StatsCard
                  title="Duplicates"
                  value={syncStatus.duplicateCount}
                  icon={FileWarning}
                  description={`No-new passes ${syncStatus.noNewPasses}`}
                />
              </div>
              <div className="grid gap-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Status: {syncStatus.state}</span>
                  <span>
                    {syncStatus.groupsFound} / {syncStatus.maxGroups || "settings max"}
                  </span>
                </div>
                <Progress value={syncProgress} />
              </div>
              {syncStatus.lastError ? (
                <Alert>
                  <AlertDescription>
                    {syncStatus.lastError}
                    {syncStatus.debugPath ? ` Debug record: ${syncStatus.debugPath}` : ""}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}

          {syncPreview ? <ImportPreviewTable preview={syncPreview} /> : null}
          {syncResult ? (
            <Alert>
              <AlertDescription>
                Imported {syncResult.imported}. Created {syncResult.created}. Updated duplicates{" "}
                {syncResult.updated}. Duplicate count {syncResult.duplicateCount}.
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/groups/GroupStatusBadge";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { FilePlus2, Files, FileWarning, RefreshCw } from "lucide-react";
import type { ImportPreview } from "@/types";

const actionStatus: Record<string, string> = {
  create: "active",
  update: "needs_review",
  duplicate: "paused",
};

export function ImportPreviewTable({ preview }: { preview: ImportPreview }) {
  const diagnostics = preview.diagnostics ?? [];
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Rows"
          value={preview.totalRows}
          icon={Files}
          description="Parsed from export"
        />
        <StatsCard
          title="New"
          value={preview.newCount}
          icon={FilePlus2}
          description="Will be created"
        />
        <StatsCard
          title="Updated"
          value={preview.updatedCount}
          icon={RefreshCw}
          description="Existing URLs"
        />
        <StatsCard
          title="Duplicates"
          value={preview.duplicateCount}
          icon={FileWarning}
          description="Existing or repeated"
        />
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Tags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.slice(0, 20).map((row) => (
              <TableRow key={`${row.url}-${row.name}`}>
                <TableCell>
                  <StatusBadge status={actionStatus[row.importAction]} label={row.importAction} />
                </TableCell>
                <TableCell>
                  <div className="font-medium">{row.name}</div>
                  <div className="max-w-[240px] truncate text-xs text-muted-foreground">
                    {row.url}
                  </div>
                </TableCell>
                <TableCell>
                  <div>{row.category}</div>
                  {row.subcategory ? (
                    <div className="text-xs text-muted-foreground">{row.subcategory}</div>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {row.source && row.source !== "manual" ? row.source : "Manual"}
                  </div>
                  {row.sourceCapturedAt ? (
                    <div className="text-xs text-muted-foreground">
                      Captured {new Date(row.sourceCapturedAt).toLocaleDateString()}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm">{row.tags.join(", ") || "None"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {preview.rows.length > 20 ? (
        <p className="text-xs text-muted-foreground">
          Showing first 20 of {preview.rows.length} rows.
        </p>
      ) : null}
      {diagnostics.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
            {diagnostics.length} import warning{diagnostics.length !== 1 ? "s" : ""}
          </p>
          <div className="rounded-md border border-amber-200 dark:border-amber-800">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Row</TableHead>
                  <TableHead className="w-24">Field</TableHead>
                  <TableHead>Value received</TableHead>
                  <TableHead>Issue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diagnostics.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{d.rowIndex}</TableCell>
                    <TableCell className="font-mono text-xs">{d.field}</TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs text-muted-foreground">
                      {d.value || <span className="italic">(blank)</span>}
                    </TableCell>
                    <TableCell className="text-xs">{d.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

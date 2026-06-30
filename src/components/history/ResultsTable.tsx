import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/groups/GroupStatusBadge";
import { EmptyState } from "@/components/layout/EmptyState";
import { describeResultMessage, isAdminApprovalMessage } from "@/lib/result-messages";
import type { SessionResult } from "@/types";

export function ResultsTable({ results }: { results: SessionResult[] }) {
  if (!results.length) {
    return <EmptyState title="No results yet" text="Session outcomes are logged as they happen." />;
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Group</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Time</TableHead>
            <TableHead className="text-right">Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((result) => (
            <TableRow key={result.id}>
              <TableCell>
                <StatusBadge status={result.status} />
              </TableCell>
              <TableCell>
                <div className="font-medium">{result.groupName}</div>
                <div className="max-w-[260px] truncate text-xs text-muted-foreground">
                  {result.groupUrl}
                </div>
              </TableCell>
              <TableCell
                title={
                  result.message && describeResultMessage(result.message) !== result.message
                    ? result.message
                    : undefined
                }
                className={
                  isAdminApprovalMessage(result.message)
                    ? "max-w-[360px] text-sm text-amber-700 dark:text-amber-400"
                    : "max-w-[360px] text-sm"
                }
              >
                {describeResultMessage(result.message)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                {new Date(result.timestamp).toLocaleString()}
              </TableCell>
              <TableCell className="text-right text-sm">{result.durationSeconds}s</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

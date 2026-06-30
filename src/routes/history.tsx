import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useHistory } from "@/hooks/use-api";
import type { ResultStatus } from "@/types";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
});

const ALL_STATUSES = "__all__";
const resultStatuses: ResultStatus[] = ["posted", "skipped", "failed", "needs_review", "pending"];

function HistoryPage() {
  const { data: history } = useHistory();
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const selectedSession = history?.sessions.find((session) => session.id === selectedSessionId);
  const filteredResults = useMemo(() => {
    const results = history?.results ?? [];
    return results.filter(
      (result) =>
        (!selectedSessionId || result.sessionId === selectedSessionId) &&
        (!statusFilter || result.status === statusFilter),
    );
  }, [history?.results, selectedSessionId, statusFilter]);

  const sessionCounts = useMemo(() => {
    if (!selectedSessionId) return null;
    const counts: Record<string, number> = {};
    for (const result of history?.results ?? []) {
      if (result.sessionId !== selectedSessionId) continue;
      counts[result.status] = (counts[result.status] ?? 0) + 1;
    }
    return counts;
  }, [history?.results, selectedSessionId]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">History</h1>
        <p className="text-sm text-muted-foreground">
          Past sessions and the per-group results log. Click a session to inspect its results.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {history?.sessions.length ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Created</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead className="text-right">Groups</TableHead>
                      <TableHead>Mode</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.sessions.map((session) => (
                      <TableRow
                        key={session.id}
                        className="cursor-pointer"
                        data-state={session.id === selectedSessionId ? "selected" : ""}
                        onClick={() =>
                          setSelectedSessionId((prev) => (prev === session.id ? "" : session.id))
                        }
                      >
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(session.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={session.state === "completed" ? "posted" : "needs_review"}
                            label={session.state}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {session.selectedGroupIds.length}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {session.mode.replace(/_/g, " ")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <EmptyState
                title="No sessions yet"
                text="Sessions you create in the Post Composer will appear here."
              />
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          {selectedSession ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Session Detail</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">State</dt>
                  <dd>
                    <StatusBadge
                      status={selectedSession.state === "completed" ? "posted" : "needs_review"}
                      label={selectedSession.state}
                    />
                  </dd>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{new Date(selectedSession.createdAt).toLocaleString()}</dd>
                  <dt className="text-muted-foreground">Started</dt>
                  <dd>
                    {selectedSession.startedAt
                      ? new Date(selectedSession.startedAt).toLocaleString()
                      : "Not started"}
                  </dd>
                  <dt className="text-muted-foreground">Completed</dt>
                  <dd>
                    {selectedSession.completedAt
                      ? new Date(selectedSession.completedAt).toLocaleString()
                      : "Not completed"}
                  </dd>
                  <dt className="text-muted-foreground">Groups</dt>
                  <dd>{selectedSession.selectedGroupIds.length}</dd>
                  <dt className="text-muted-foreground">Results</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {sessionCounts && Object.keys(sessionCounts).length ? (
                      Object.entries(sessionCounts).map(([status, count]) => (
                        <StatusBadge
                          key={status}
                          status={status}
                          label={`${status.replace(/_/g, " ")}: ${count}`}
                        />
                      ))
                    ) : (
                      <span className="text-muted-foreground">No results recorded</span>
                    )}
                  </dd>
                </dl>
                <div className="max-h-[140px] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
                  {selectedSession.postText}
                </div>
                <div>
                  <Button variant="outline" size="sm" onClick={() => setSelectedSessionId("")}>
                    Show all sessions
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {selectedSession ? "Results for selected session" : "Results Log"}
                </CardTitle>
                <Select
                  value={statusFilter || ALL_STATUSES}
                  onValueChange={(next) => setStatusFilter(next === ALL_STATUSES ? "" : next)}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
                    {resultStatuses.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <ResultsTable results={filteredResults} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

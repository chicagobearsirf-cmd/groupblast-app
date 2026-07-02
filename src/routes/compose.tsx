import { memo, useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/layout/ErrorState";
import { api } from "@/lib/api";
import { queryKeys, useGroups, useInvalidate, useSettings } from "@/hooks/use-api";
import type { FacebookGroup } from "@/types";

export const Route = createFileRoute("/compose")({
  component: ComposerPage,
});

function ComposerPage() {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const {
    data: groups = [],
    isLoading: groupsLoading,
    isError: groupsError,
    refetch: refetchGroups,
  } = useGroups();
  const { data: settings } = useSettings();
  const groupListRef = useRef<HTMLDivElement | null>(null);

  const [postText, setPostText] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return groups.filter(
      (group) =>
        group.status === "active" &&
        (!normalizedSearch || group.name.toLowerCase().includes(normalizedSearch)),
    );
  }, [groups, search]);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => groupListRef.current,
    estimateSize: () => 48,
    overscan: 8,
  });

  const estimateSeconds = settings
    ? selected.length * ((settings.minDelaySeconds + settings.maxDelaySeconds) / 2 + 20)
    : 0;

  const toggleGroup = useCallback((id: string, checked: boolean) => {
    setSelected((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }, []);

  const selectAll = useCallback(() => setSelected(filtered.map((g) => g.id)), [filtered]);
  const clearAll = useCallback(() => setSelected([]), []);

  const createSession = async () => {
    setCreating(true);
    try {
      await api.createSession(postText, selected);
      await invalidate(queryKeys.sessionStatus, queryKeys.history);
      toast.success("Queue created — head to Scheduled to start.");
      void navigate({ to: "/queue" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create queue.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">New Post</h1>
        <p className="text-sm text-muted-foreground">
          Write your post, pick your groups, and create the queue.
          {settings?.autoSubmitEnabled
            ? " The app will click Post for you."
            : " The app fills the post — you click Post."}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Post content */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your post</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              className="min-h-[220px]"
              value={postText}
              onChange={(e) => setPostText(e.target.value)}
              placeholder="Paste or type your Facebook post here."
              data-tour="compose-textarea"
            />
            {selected.length > 0 && postText.trim() ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                {selected.length} group{selected.length === 1 ? "" : "s"} selected ·{" "}
                ~{Math.ceil(estimateSeconds / 60)} min
              </div>
            ) : null}
            {selected.length > 5 ? (
              <Alert variant="destructive">
                <AlertDescription>
                  More than 5 groups selected — run a one-group test first.
                </AlertDescription>
              </Alert>
            ) : null}
            <Button
              className="h-12"
              disabled={!postText.trim() || !selected.length || creating}
              onClick={() => void createSession()}
              data-tour="compose-create-queue"
            >
              {creating ? "Creating…" : `Create queue${selected.length ? ` (${selected.length})` : ""}`}
            </Button>
          </CardContent>
        </Card>

        {/* Group picker */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Choose groups</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                placeholder="Search groups…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={groupsLoading || groupsError || !filtered.length}
                onClick={selectAll}
              >
                All
              </Button>
              <Button variant="outline" size="sm" disabled={!selected.length} onClick={clearAll}>
                Clear
              </Button>
            </div>
            {groupsLoading ? (
              <p className="p-2 text-sm text-muted-foreground">Loading groups…</p>
            ) : groupsError ? (
              <ErrorState
                title="Can't reach the local API"
                text="Groups could not load from the local automation service."
                onRetry={() => void refetchGroups()}
              />
            ) : filtered.length ? (
              <div
                ref={groupListRef}
                className="overflow-y-auto"
                style={{
                  height: Math.min(380, Math.max(48, rowVirtualizer.getTotalSize())),
                }}
              >
                <div
                  className="relative"
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const group = filtered[virtualRow.index];
                    return (
                      <ComposeGroupRow
                        key={group.id}
                        group={group}
                        checked={selectedSet.has(group.id)}
                        onToggle={toggleGroup}
                        style={{
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="p-2 text-sm text-muted-foreground">
                {groups.length === 0
                  ? "No groups yet — go to Add Groups first."
                  : "No groups match your search."}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const ComposeGroupRow = memo(function ComposeGroupRow({
  group,
  checked,
  onToggle,
  style,
}: {
  group: FacebookGroup;
  checked: boolean;
  onToggle: (id: string, checked: boolean) => void;
  style: CSSProperties;
}) {
  return (
    <label
      className="absolute left-0 right-0 flex cursor-pointer items-center gap-3 rounded-md border p-2.5 hover:bg-accent"
      style={style}
    >
      <Checkbox checked={checked} onCheckedChange={(next) => onToggle(group.id, Boolean(next))} />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{group.name}</span>
      {group.category && group.category !== "General" ? (
        <span className="shrink-0 text-xs text-muted-foreground">{group.category}</span>
      ) : null}
    </label>
  );
});

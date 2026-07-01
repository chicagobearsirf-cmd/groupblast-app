import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { queryKeys, useGroups, useInvalidate, useSettings } from "@/hooks/use-api";

export const Route = createFileRoute("/compose")({
  component: ComposerPage,
});

function ComposerPage() {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data: groups = [] } = useGroups();
  const { data: settings } = useSettings();

  const [postText, setPostText] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const filtered = groups.filter(
    (g) =>
      g.status === "active" &&
      (!search || g.name.toLowerCase().includes(search.toLowerCase())),
  );

  const estimateSeconds = settings
    ? selected.length * ((settings.minDelaySeconds + settings.maxDelaySeconds) / 2 + 20)
    : 0;

  const toggleGroup = (id: string, checked: boolean) =>
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));

  const selectAll = () => setSelected(filtered.map((g) => g.id));
  const clearAll = () => setSelected([]);

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
              <Button variant="outline" size="sm" onClick={selectAll}>
                All
              </Button>
              <Button variant="outline" size="sm" onClick={clearAll}>
                Clear
              </Button>
            </div>
            <div className="flex max-h-[380px] flex-col gap-1 overflow-y-auto">
              {filtered.map((group) => (
                <label
                  key={group.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border p-2.5 hover:bg-accent"
                >
                  <Checkbox
                    checked={selected.includes(group.id)}
                    onCheckedChange={(checked) => toggleGroup(group.id, Boolean(checked))}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {group.name}
                  </span>
                  {group.category && group.category !== "General" ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{group.category}</span>
                  ) : null}
                </label>
              ))}
              {!filtered.length ? (
                <p className="p-2 text-sm text-muted-foreground">
                  {groups.length === 0
                    ? "No groups yet — go to Add Groups first."
                    : "No groups match your search."}
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

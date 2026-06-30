import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/groups/GroupStatusBadge";
import {
  GroupFilters,
  filterGroups,
  type GroupFilterState,
} from "@/components/groups/GroupFilters";
import { api } from "@/lib/api";
import {
  queryKeys,
  useCollections,
  useGroupTaxonomy,
  useGroups,
  useInvalidate,
  useSettings,
} from "@/hooks/use-api";

export const Route = createFileRoute("/compose")({
  component: ComposerPage,
});

const ANY_COLLECTION = "__any__";

function ComposerPage() {
  const navigate = useNavigate();
  const invalidate = useInvalidate();
  const { data: groups = [] } = useGroups();
  const { data: collections = [] } = useCollections();
  const { data: settings } = useSettings();
  const { categories, subcategories } = useGroupTaxonomy();

  const [postText, setPostText] = useState("");
  const [filters, setFilters] = useState<GroupFilterState>({
    search: "",
    category: "",
    subcategory: "",
    status: "active",
    source: "",
  });
  const [collectionId, setCollectionId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const collection = collections.find((item) => item.id === collectionId);
  const filtered = filterGroups(groups, filters).filter(
    (group) => !collection || collection.groupIds.includes(group.id),
  );

  const lines = postText ? postText.split(/\r\n|\r|\n/).length : 0;
  const estimateSeconds = settings
    ? selected.length * ((settings.minDelaySeconds + settings.maxDelaySeconds) / 2 + 20)
    : 0;

  const selectOneGroup = () => {
    const nextGroupId = selected[0] ?? filtered[0]?.id;
    setSelected(nextGroupId ? [nextGroupId] : []);
  };

  const createSession = async () => {
    setCreating(true);
    try {
      const session = await api.createSession(postText, selected);
      await invalidate(queryKeys.sessionStatus, queryKeys.history);
      toast.success(`Queue created: ${session.id}`);
      void navigate({ to: "/queue" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create queue.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">New Post</h1>
        <p className="text-sm text-muted-foreground">
          Write your post, choose your groups, and send.
          {settings?.autoSubmitEnabled
            ? " The app will click Post for you."
            : " The app fills in your post and waits for you to click Post."}
        </p>
      </div>

      {/* min-w-0 on each card overrides the browser's default grid-item min-width
          (min-content), which otherwise forces the row to be at least as wide as
          its widest unwrapped content — making the page wider than the viewport
          instead of letting columns shrink to fit. */}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[1fr_1.2fr_1fr]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Your post</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              className="min-h-[260px]"
              value={postText}
              onChange={(event) => setPostText(event.target.value)}
              placeholder="Paste the finished Facebook post here."
              data-tour="compose-textarea"
            />
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>{postText.length} characters</span>
              <span>{lines} lines</span>
              <span>{selected.length} selected groups</span>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Choose groups</CardTitle>
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-3">
            <GroupFilters
              value={filters}
              onChange={setFilters}
              categories={categories}
              subcategories={subcategories}
              statuses={["active", "paused", "needs_review", "failed"]}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={collectionId || ANY_COLLECTION}
                onValueChange={(next) => setCollectionId(next === ANY_COLLECTION ? "" : next)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Any saved list" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY_COLLECTION}>Any saved list</SelectItem>
                  {collections.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setSelected(
                    Array.from(new Set([...selected, ...filtered.map((group) => group.id)])),
                  )
                }
              >
                Select visible
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!filtered.length && !selected.length}
                onClick={selectOneGroup}
                data-tour="compose-test-one"
              >
                Test One Group
              </Button>
            </div>
            <Alert>
              <AlertDescription>Recommended first test: 1 group.</AlertDescription>
            </Alert>
            <div className="flex max-h-[320px] flex-col gap-1 overflow-y-auto">
              {filtered.map((group) => (
                <label
                  key={group.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md border p-2 hover:bg-accent"
                >
                  <Checkbox
                    checked={selected.includes(group.id)}
                    onCheckedChange={(checked) =>
                      setSelected(
                        checked
                          ? [...selected, group.id]
                          : selected.filter((id) => id !== group.id),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{group.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[group.category, group.subcategory].filter(Boolean).join(" / ")} ·{" "}
                      {group.url}
                    </span>
                  </span>
                  <StatusBadge status={group.status} />
                </label>
              ))}
              {!filtered.length ? (
                <p className="p-2 text-sm text-muted-foreground">No groups match the filters.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Review &amp; send</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="max-h-[160px] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
              {postText || "Post preview will appear here after you paste prepared copy."}
            </div>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Groups selected</dt>
              <dd className="font-medium">{selected.length}</dd>
              <dt className="text-muted-foreground">Estimated time</dt>
              <dd className="font-medium">{Math.ceil(estimateSeconds / 60)} min</dd>
            </dl>
            {selected.length > 5 ? (
              <Alert variant="destructive">
                <AlertDescription>
                  You picked more than 5 groups. Try one group first to make sure it works.
                </AlertDescription>
              </Alert>
            ) : null}
            <Button
              className="h-12"
              disabled={!postText.trim() || !selected.length || creating}
              onClick={() => void createSession()}
              data-tour="compose-create-queue"
            >
              {creating ? "Creating…" : "Create post queue"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

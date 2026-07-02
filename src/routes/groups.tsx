import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, CheckSquare, FolderInput, ListPlus, Plus } from "lucide-react";
import { toast } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GroupsTable } from "@/components/groups/GroupsTable";
import { GroupFormDialog } from "@/components/groups/GroupFormDialog";
import { BulkCategorizeDialog } from "@/components/groups/BulkCategorizeDialog";
import {
  GroupFilters,
  emptyFilters,
  filterGroups,
  type GroupFilterState,
} from "@/components/groups/GroupFilters";
import { TextPromptDialog } from "@/components/layout/TextPromptDialog";
import { ErrorState } from "@/components/layout/ErrorState";
import { api } from "@/lib/api";
import {
  queryKeys,
  useCollections,
  useGroupTaxonomy,
  useGroups,
  useInvalidate,
} from "@/hooks/use-api";
import type { FacebookGroup } from "@/types";

export const Route = createFileRoute("/groups")({
  component: GroupsPage,
});

function GroupsPage() {
  const { data: groups = [], isLoading, isError, refetch } = useGroups();
  const { data: collections = [] } = useCollections();
  const { categories, subcategories, sources } = useGroupTaxonomy();
  const invalidate = useInvalidate();

  const [filters, setFilters] = useState<GroupFilterState>(emptyFilters);
  const [selected, setSelected] = useState<string[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FacebookGroup | null>(null);
  const [categorizeOpen, setCategorizeOpen] = useState(false);
  const [subcategorizeOpen, setSubcategorizeOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Archived (status="removed") groups stay in the DB but are hidden from the
  // working list by default — otherwise removed cars/bikes clutter every view.
  const archivedCount = useMemo(
    () => groups.filter((group) => group.status === "removed").length,
    [groups],
  );
  const visible = useMemo(
    () => (showArchived ? groups : groups.filter((group) => group.status !== "removed")),
    [groups, showArchived],
  );

  // Category breakdown for the quick-filter chips, busiest first.
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const group of visible) {
      counts.set(group.category, (counts.get(group.category) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [visible]);

  const filtered = filterGroups(visible, filters);

  // True when every currently-matching group is already selected — drives the
  // "Select all / Clear" toggle, which works on the filtered set so you can
  // grab a whole category at once via the chips above.
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((group) => selected.includes(group.id));

  const saveGroup = async (input: Parameters<typeof api.saveGroup>[0]) => {
    try {
      if (editing) {
        await api.updateGroup(editing.id, input);
      } else {
        await api.saveGroup(input);
      }
      await invalidate(queryKeys.groups);
      toast.success(editing ? "Group updated." : "Group saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save group.");
      throw error;
    }
  };

  const archiveGroup = async (group: FacebookGroup) => {
    try {
      await api.archiveGroup(group.id);
      setSelected((prev) => prev.filter((id) => id !== group.id));
      await invalidate(queryKeys.groups);
      toast.success(`Archived ${group.name}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to archive group.");
    }
  };

  const deleteGroup = async (group: FacebookGroup) => {
    if (!window.confirm(`Permanently delete "${group.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteGroup(group.id);
      setSelected((prev) => prev.filter((id) => id !== group.id));
      await invalidate(queryKeys.groups);
      toast.success(`Deleted ${group.name}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete group.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Groups</h1>
          <p className="text-sm text-muted-foreground">
            {visible.length} active · {filtered.length} matching · {selected.length} selected
            {archivedCount ? ` · ${archivedCount} archived` : ""}
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Group
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        These groups are saved in this computer&apos;s local database. They are not shared with the
        hosted preview or with reps on other computers until team/cloud sync is built. Use Import to
        move data between machines.
      </p>

      {categoryCounts.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilters({ ...filters, category: "" })}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filters.category === ""
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            All · {visible.length}
          </button>
          {categoryCounts.map(([category, count]) => (
            <button
              key={category}
              type="button"
              onClick={() =>
                setFilters({ ...filters, category: filters.category === category ? "" : category })
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filters.category === category
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border hover:bg-muted"
              }`}
            >
              {category} · {count}
            </button>
          ))}
        </div>
      ) : null}

      <GroupFilters
        value={filters}
        onChange={setFilters}
        categories={categories}
        subcategories={subcategories}
        sources={sources}
        statuses={["active", "paused", "needs_review", "failed"]}
      >
        <Button
          variant="outline"
          disabled={!filtered.length}
          onClick={() => setSelected(allFilteredSelected ? [] : filtered.map((group) => group.id))}
        >
          <CheckSquare className="mr-2 h-4 w-4" />
          {allFilteredSelected ? "Clear selection" : `Select all (${filtered.length})`}
        </Button>
        <Button
          variant={showArchived ? "secondary" : "outline"}
          onClick={() => setShowArchived((prev) => !prev)}
        >
          <Archive className="mr-2 h-4 w-4" />
          {showArchived ? "Hide archived" : "Show archived"}
          {archivedCount ? ` (${archivedCount})` : ""}
        </Button>
        <Button
          variant="outline"
          disabled={!selected.length}
          onClick={() => setCategorizeOpen(true)}
        >
          <FolderInput className="mr-2 h-4 w-4" />
          Bulk categorize
        </Button>
        <Button
          variant="outline"
          disabled={!selected.length}
          onClick={() => setSubcategorizeOpen(true)}
        >
          <FolderInput className="mr-2 h-4 w-4" />
          Bulk subcategory
        </Button>
        <Button
          variant="outline"
          disabled={!selected.length}
          onClick={() => setCollectionOpen(true)}
        >
          <ListPlus className="mr-2 h-4 w-4" />
          Save list
        </Button>
      </GroupFilters>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading groups…</p>
      ) : isError ? (
        <ErrorState
          title="Can't reach the local API"
          text="Group data could not load from the local automation service."
          onRetry={() => void refetch()}
        />
      ) : (
        <GroupsTable
          groups={filtered}
          selected={selected}
          onSelectedChange={setSelected}
          onEdit={(group) => {
            setEditing(group);
            setFormOpen(true);
          }}
          onArchive={archiveGroup}
          onDelete={deleteGroup}
        />
      )}

      {collections.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saved Collections</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {collections.map((collection) => (
              <Badge key={collection.id} variant="secondary">
                {collection.name} · {collection.groupIds.length}
              </Badge>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <GroupFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        group={editing}
        onSubmit={saveGroup}
      />
      <BulkCategorizeDialog
        open={categorizeOpen}
        onOpenChange={setCategorizeOpen}
        count={selected.length}
        categories={categories}
        onSubmit={async (category) => {
          await api.bulkCategorize(selected, { category });
          await invalidate(queryKeys.groups);
          toast.success("Selected groups categorized.");
        }}
      />
      <TextPromptDialog
        open={subcategorizeOpen}
        onOpenChange={setSubcategorizeOpen}
        title="Bulk subcategory"
        description={`Set the subcategory for ${selected.length} selected group(s).`}
        label="Subcategory"
        confirmLabel="Apply subcategory"
        onSubmit={async (subcategory) => {
          await api.bulkCategorize(selected, { subcategory });
          await invalidate(queryKeys.groups);
          toast.success("Selected groups updated.");
        }}
      />
      <TextPromptDialog
        open={collectionOpen}
        onOpenChange={setCollectionOpen}
        title="Save selection as list"
        description={`Save ${selected.length} selected group(s) as a reusable collection.`}
        label="Collection name"
        confirmLabel="Save list"
        onSubmit={async (name) => {
          await api.saveCollection({ name, groupIds: selected });
          await invalidate(queryKeys.collections);
          toast.success("Collection saved.");
        }}
      />
    </div>
  );
}

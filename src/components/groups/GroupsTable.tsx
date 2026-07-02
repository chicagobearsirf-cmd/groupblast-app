import { memo, useCallback, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Archive, Pencil, Trash2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/groups/GroupStatusBadge";
import { EmptyState } from "@/components/layout/EmptyState";
import type { FacebookGroup } from "@/types";

export function GroupsTable({
  groups,
  selected,
  onSelectedChange,
  onEdit,
  onArchive,
  onDelete,
}: {
  groups: FacebookGroup[];
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  onEdit: (group: FacebookGroup) => void;
  onArchive: (group: FacebookGroup) => void;
  onDelete: (group: FacebookGroup) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const allSelected = groups.length > 0 && groups.every((group) => selectedSet.has(group.id));
  const rowVirtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 76,
    overscan: 8,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const topPadding = virtualRows.length ? virtualRows[0].start : 0;
  const bottomPadding = virtualRows.length
    ? rowVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;
  const toggleGroup = useCallback(
    (group: FacebookGroup, checked: boolean) => {
      onSelectedChange(
        checked ? [...selected, group.id] : selected.filter((id) => id !== group.id),
      );
    },
    [onSelectedChange, selected],
  );

  if (!groups.length) {
    return (
      <EmptyState
        title="No matching groups"
        text="Adjust filters or import your first group list."
      />
    );
  }

  return (
    <div ref={scrollRef} className="max-h-[640px] overflow-auto rounded-md border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) =>
                  onSelectedChange(checked ? groups.map((group) => group.id) : [])
                }
                aria-label="Select all"
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last posted</TableHead>
            <TableHead className="text-right">Failures</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {topPadding > 0 ? (
            <TableRow>
              <TableCell colSpan={8} style={{ height: topPadding }} />
            </TableRow>
          ) : null}
          {virtualRows.map((virtualRow) => {
            const group = groups[virtualRow.index];
            return (
              <GroupTableRow
                key={group.id}
                group={group}
                checked={selectedSet.has(group.id)}
                onToggle={toggleGroup}
                onEdit={onEdit}
                onArchive={onArchive}
                onDelete={onDelete}
              />
            );
          })}
          {bottomPadding > 0 ? (
            <TableRow>
              <TableCell colSpan={8} style={{ height: bottomPadding }} />
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

const GroupTableRow = memo(function GroupTableRow({
  group,
  checked,
  onToggle,
  onEdit,
  onArchive,
  onDelete,
}: {
  group: FacebookGroup;
  checked: boolean;
  onToggle: (group: FacebookGroup, checked: boolean) => void;
  onEdit: (group: FacebookGroup) => void;
  onArchive: (group: FacebookGroup) => void;
  onDelete: (group: FacebookGroup) => void;
}) {
  const sourceCapturedLabel = useMemo(
    () => (group.sourceCapturedAt ? new Date(group.sourceCapturedAt).toLocaleDateString() : ""),
    [group.sourceCapturedAt],
  );
  const lastPostedLabel = useMemo(
    () => (group.lastPostedAt ? new Date(group.lastPostedAt).toLocaleDateString() : "Never"),
    [group.lastPostedAt],
  );

  return (
    <TableRow data-state={checked ? "selected" : ""}>
      <TableCell>
        <Checkbox
          checked={checked}
          onCheckedChange={(next) => onToggle(group, Boolean(next))}
          aria-label={`Select ${group.name}`}
        />
      </TableCell>
      <TableCell className="max-w-[260px]">
        <div className="truncate font-medium" title={group.name}>
          {group.name}
        </div>
        <a
          href={group.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-xs text-muted-foreground hover:underline"
        >
          {group.url}
        </a>
      </TableCell>
      <TableCell>
        <div>{group.category}</div>
        {group.subcategory ? (
          <div className="text-xs text-muted-foreground">{group.subcategory}</div>
        ) : null}
      </TableCell>
      <TableCell>
        {group.source && group.source !== "manual" ? (
          <>
            <Badge variant="secondary">{group.source}</Badge>
            {sourceCapturedLabel ? (
              <div className="mt-1 text-xs text-muted-foreground">
                Captured {sourceCapturedLabel}
              </div>
            ) : null}
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Manual</span>
        )}
      </TableCell>
      <TableCell>
        <StatusBadge status={group.status} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{lastPostedLabel}</TableCell>
      <TableCell className="text-right">{group.failureCount}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" title="Edit group" onClick={() => onEdit(group)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Archive group"
            onClick={() => onArchive(group)}
          >
            <Archive className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Delete group permanently"
            onClick={() => onDelete(group)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

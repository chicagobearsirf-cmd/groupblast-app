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
  if (!groups.length) {
    return (
      <EmptyState
        title="No matching groups"
        text="Adjust filters or import your first group list."
      />
    );
  }

  const allSelected = groups.length > 0 && groups.every((group) => selected.includes(group.id));

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
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
          {groups.map((group) => (
            <TableRow key={group.id} data-state={selected.includes(group.id) ? "selected" : ""}>
              <TableCell>
                <Checkbox
                  checked={selected.includes(group.id)}
                  onCheckedChange={(checked) =>
                    onSelectedChange(
                      checked ? [...selected, group.id] : selected.filter((id) => id !== group.id),
                    )
                  }
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
                    {group.sourceCapturedAt ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Captured {new Date(group.sourceCapturedAt).toLocaleDateString()}
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
              <TableCell className="text-sm text-muted-foreground">
                {group.lastPostedAt ? new Date(group.lastPostedAt).toLocaleDateString() : "Never"}
              </TableCell>
              <TableCell className="text-right">{group.failureCount}</TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit group"
                    onClick={() => onEdit(group)}
                  >
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
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

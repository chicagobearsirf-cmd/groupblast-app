import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GroupInput } from "@/lib/api";
import type { FacebookGroup, GroupStatus } from "@/types";

type FormState = {
  name: string;
  url: string;
  category: string;
  subcategory: string;
  tags: string;
  notes: string;
  status: GroupStatus;
};

const emptyForm: FormState = {
  name: "",
  url: "",
  category: "",
  subcategory: "",
  tags: "",
  notes: "",
  status: "active",
};

export function GroupFormDialog({
  open,
  onOpenChange,
  group,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group?: FacebookGroup | null;
  onSubmit: (input: GroupInput) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      group
        ? {
            name: group.name,
            url: group.url,
            category: group.category,
            subcategory: group.subcategory,
            tags: group.tags.join(", "),
            notes: group.notes,
            status: group.status,
          }
        : emptyForm,
    );
  }, [open, group]);

  const set = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        url: form.url.trim(),
        category: form.category.trim() || "Uncategorized",
        subcategory: form.subcategory.trim(),
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        notes: form.notes,
        status: form.status,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{group ? "Edit Group" : "Add Group"}</DialogTitle>
          <DialogDescription>
            {group
              ? "Update the saved details for this Facebook group."
              : "Save a Facebook group you want to post into."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              value={form.name}
              onChange={(event) => set({ name: event.target.value })}
              placeholder="Chicago Real Estate Investors"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="group-url">Facebook group URL</Label>
            <Input
              id="group-url"
              value={form.url}
              onChange={(event) => set({ url: event.target.value })}
              placeholder="https://www.facebook.com/groups/..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="group-category">Category</Label>
              <Input
                id="group-category"
                value={form.category}
                onChange={(event) => set({ category: event.target.value })}
                placeholder="Real Estate"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="group-subcategory">Subcategory</Label>
              <Input
                id="group-subcategory"
                value={form.subcategory}
                onChange={(event) => set({ subcategory: event.target.value })}
                placeholder="Investors"
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="group-tags">Tags (comma separated)</Label>
            <Input
              id="group-tags"
              value={form.tags}
              onChange={(event) => set({ tags: event.target.value })}
              placeholder="leads, outreach"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="group-notes">Notes</Label>
            <Input
              id="group-notes"
              value={form.notes}
              onChange={(event) => set({ notes: event.target.value })}
            />
          </div>
          {group ? (
            <div className="grid gap-1.5">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(status) => set({ status: status as GroupStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["active", "paused", "needs_review", "failed", "removed"] as const).map(
                    (status) => (
                      <SelectItem key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!form.name.trim() || !form.url.trim() || saving} onClick={submit}>
            {group ? "Save changes" : "Add group"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

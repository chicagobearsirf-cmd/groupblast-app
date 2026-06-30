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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NEW = "__new__";

// Category picker for bulk-categorize. Defaults to the existing taxonomy so reps
// reuse categories instead of retyping them (which spawned near-duplicates like
// "Real estate" vs "Real Estate"). "New category…" still allows a fresh one.
export function BulkCategorizeDialog({
  open,
  onOpenChange,
  count,
  categories,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  categories: string[];
  onSubmit: (category: string) => Promise<void>;
}) {
  const [picked, setPicked] = useState("");
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPicked("");
      setCustom("");
    }
  }, [open]);

  const value = picked === NEW ? custom.trim() : picked;

  const submit = async () => {
    if (!value) return;
    setSaving(true);
    try {
      await onSubmit(value);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Bulk categorize</DialogTitle>
          <DialogDescription>Set the category for {count} selected group(s).</DialogDescription>
        </DialogHeader>
        <Select value={picked} onValueChange={setPicked}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
            <SelectItem value={NEW}>+ New category…</SelectItem>
          </SelectContent>
        </Select>
        {picked === NEW ? (
          <Input
            autoFocus
            placeholder="New category name"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && value && !saving) void submit();
            }}
          />
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!value || saving} onClick={submit}>
            Apply category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

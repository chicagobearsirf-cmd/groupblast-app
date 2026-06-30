import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  posted: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  paused: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  pending: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  needs_review: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  skipped: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  removed: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", statusStyles[status])}>
      {label ?? status.replace(/_/g, " ")}
    </Badge>
  );
}

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FacebookGroup } from "@/types";

export type GroupFilterState = {
  search: string;
  category: string;
  subcategory: string;
  status: string;
  source: string;
};

export const emptyFilters: GroupFilterState = {
  search: "",
  category: "",
  subcategory: "",
  status: "",
  source: "",
};

export function filterGroups(groups: FacebookGroup[], filters: GroupFilterState) {
  return groups.filter((group) => {
    const haystack =
      `${group.name} ${group.url} ${group.subcategory} ${group.source}`.toLowerCase();
    return (
      (!filters.search || haystack.includes(filters.search.toLowerCase())) &&
      (!filters.category || group.category === filters.category) &&
      (!filters.subcategory || group.subcategory === filters.subcategory) &&
      (!filters.status || group.status === filters.status) &&
      (!filters.source || (group.source || "manual") === filters.source)
    );
  });
}

const ALL = "__all__";

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <Select value={value || ALL} onValueChange={(next) => onChange(next === ALL ? "" : next)}>
      <SelectTrigger className="w-[170px]">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{placeholder}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option.replace(/_/g, " ")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function GroupFilters({
  value,
  onChange,
  categories,
  subcategories,
  sources,
  statuses = ["active", "paused", "needs_review", "failed", "removed"],
  children,
}: {
  value: GroupFilterState;
  onChange: (value: GroupFilterState) => void;
  categories: string[];
  subcategories: string[];
  sources?: string[];
  statuses?: string[];
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="w-[220px] pl-8"
          placeholder="Search groups or URLs"
          value={value.search}
          onChange={(event) => onChange({ ...value, search: event.target.value })}
        />
      </div>
      <FilterSelect
        value={value.category}
        onChange={(category) => onChange({ ...value, category })}
        placeholder="All categories"
        options={categories}
      />
      <FilterSelect
        value={value.subcategory}
        onChange={(subcategory) => onChange({ ...value, subcategory })}
        placeholder="All subcategories"
        options={subcategories}
      />
      <FilterSelect
        value={value.status}
        onChange={(status) => onChange({ ...value, status })}
        placeholder="All statuses"
        options={statuses}
      />
      {sources ? (
        <FilterSelect
          value={value.source}
          onChange={(source) => onChange({ ...value, source })}
          placeholder="All sources"
          options={sources}
        />
      ) : null}
      {children}
    </div>
  );
}

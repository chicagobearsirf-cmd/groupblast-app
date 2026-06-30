import type { GroupStatus } from "./types";
import { categorizeGroupName } from "./group-categorizer";

export type ImportDiagnostic = {
  rowIndex: number; // 1-based data row (not counting header)
  field: string;
  value: string;
  message: string;
};

type ImportRow = {
  groupName?: string;
  groupUrl?: string;
  group_name?: string;
  group_url?: string;
  name?: string;
  url?: string;
  category?: string;
  subcategory?: string;
  notes?: string;
  niche?: string;
  memberCount?: string;
  member_count?: string;
  capturedAt?: string;
  captured_at?: string;
  updatedAt?: string;
  updated_at?: string;
  source?: string;
  tags?: string[] | string;
  status?: string;
};

const allowedStatuses = new Set<GroupStatus>([
  "active",
  "paused",
  "needs_review",
  "failed",
  "removed",
]);

const parseStatus = (status: unknown) => {
  const value = String(status || "");
  return allowedStatuses.has(value as GroupStatus) ? (value as GroupStatus) : undefined;
};

const splitCsvLine = (line: string) => {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
};

const parseCsv = (content: string): ImportRow[] => {
  const lines = content
    .replace(/^\ufeff/, "") // strip UTF-8 BOM (U+FEFF, added by Excel and some editors)
    .replace(/\r\n/g, "\n") // CRLF → LF
    .replace(/\r/g, "\n") // lone CR → LF (old Mac line endings)
    .split("\n")
    .filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return headers.reduce<ImportRow>((row, header, index) => {
      row[header as keyof ImportRow] = (values[index] ?? "") as never;
      return row;
    }, {});
  });
};

const parseTags = (tags: ImportRow["tags"]) => {
  if (Array.isArray(tags))
    return tags
      .map(String)
      .map((tag) => tag.trim())
      .filter(Boolean);
  if (!tags) return [];
  return String(tags)
    .split(/[;,|]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const parseRaw = (content: string, format: "csv" | "json" | "auto"): ImportRow[] => {
  if (format === "json") return parseJson(content);
  if (format === "csv") return parseCsv(content);
  const trimmed = content.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) return parseJson(trimmed);
  if (
    trimmed.includes("group_name=") ||
    trimmed.includes("group_url=") ||
    trimmed.includes("fb_import=")
  ) {
    return parseQueryExport(trimmed);
  }
  return parseCsv(trimmed);
};

export const parseImportAuto = (content: string, format: "csv" | "json" | "auto" = "auto") => {
  const { normalized } = normalizeRows(parseRaw(content, format));
  return normalized;
};

export const parseImportAutoWithDiagnostics = (
  content: string,
  format: "csv" | "json" | "auto" = "auto",
): { rows: ReturnType<typeof normalizeRow>[]; diagnostics: ImportDiagnostic[] } => {
  const { normalized, diagnostics } = normalizeRows(parseRaw(content, format));
  return { rows: normalized, diagnostics };
};

const parseJson = (content: string): ImportRow[] => {
  const parsed = JSON.parse(content) as
    | ImportRow[]
    | { capturedGroups?: ImportRow[]; groups?: ImportRow[] };
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.capturedGroups)) return parsed.capturedGroups;
  if (Array.isArray(parsed.groups)) return parsed.groups;
  throw new Error(
    "JSON import must be an array of group objects or an object with a groups array.",
  );
};

const parseQueryExport = (content: string): ImportRow[] => {
  const rows = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const url = line.includes("://") ? new URL(line) : new URL(`https://local.invalid/?${line}`);
      const params = url.searchParams;
      return {
        group_name: params.get("group_name") ?? "",
        group_url: params.get("group_url") ?? "",
        niche: params.get("niche") ?? "",
        status: params.get("status") ?? "",
        notes: params.get("notes") ?? "",
        source: "facebook-group-capture-extension",
      };
    });
  return rows;
};

const FB_GROUP_RE = /facebook\.com\/groups\//i;

const normalizeRows = (
  rows: ImportRow[],
): { normalized: ReturnType<typeof normalizeRow>[]; diagnostics: ImportDiagnostic[] } => {
  if (!Array.isArray(rows)) throw new Error("JSON import must be an array of group objects.");
  const diagnostics: ImportDiagnostic[] = [];
  const normalized: ReturnType<typeof normalizeRow>[] = [];
  rows.forEach((row, i) => {
    const rowIndex = i + 1;
    const result = normalizeRow(row);
    if (!result.name) {
      diagnostics.push({
        rowIndex,
        field: "name",
        value: String(row.groupName ?? row.group_name ?? row.name ?? ""),
        message: "Required field is blank — row skipped",
      });
      return;
    }
    if (!result.url) {
      diagnostics.push({
        rowIndex,
        field: "url",
        value: String(row.groupUrl ?? row.group_url ?? row.url ?? ""),
        message: "Required field is blank — row skipped",
      });
      return;
    }
    if (!FB_GROUP_RE.test(result.url)) {
      diagnostics.push({
        rowIndex,
        field: "url",
        value: result.url,
        message: "URL does not contain facebook.com/groups/ — verify this is a Facebook group URL",
      });
    }
    if (row.status && !result.status) {
      diagnostics.push({
        rowIndex,
        field: "status",
        value: String(row.status),
        message: `Unknown status value — must be one of: ${[...allowedStatuses].join(", ")}. Defaulting to "active".`,
      });
    }
    normalized.push(result);
  });
  return { normalized, diagnostics };
};

const normalizeRow = (row: ImportRow) => {
  const name = String(row.groupName ?? row.group_name ?? row.name ?? "").trim();
  const url = String(row.groupUrl ?? row.group_url ?? row.url ?? "").trim();
  const explicitCategory = String(row.category ?? row.niche ?? "").trim();
  const explicitSubcategory = String(row.subcategory ?? "").trim();
  const auto =
    !explicitCategory || explicitCategory === "Uncategorized" ? categorizeGroupName(name) : null;
  const category = auto ? auto.category : explicitCategory || "Uncategorized";
  const subcategory = explicitSubcategory || (auto?.subcategory ?? "");
  const source = String(row.source || "manual").trim();
  const memberCount = row.memberCount ?? row.member_count;
  const capturedAt = row.capturedAt ?? row.captured_at;
  const updatedAt = row.updatedAt ?? row.updated_at;
  const status = parseStatus(row.status);
  const metadata = [
    memberCount ? `Member count: ${memberCount}` : "",
    row.status && !status ? `Extension status: ${row.status}` : "",
  ].filter(Boolean);
  return {
    name,
    url,
    category,
    subcategory,
    tags: parseTags(row.tags),
    status,
    notes: [String(row.notes ?? "").trim(), ...metadata].filter(Boolean).join("\n"),
    source,
    sourceCapturedAt: capturedAt ? String(capturedAt) : null,
    sourceUpdatedAt: updatedAt ? String(updatedAt) : null,
  };
};

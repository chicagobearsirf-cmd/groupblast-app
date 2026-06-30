import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type {
  AppSettings,
  FacebookGroup,
  GroupCollection,
  GroupStatus,
  PostSession,
  ResultStatus,
  SessionResult,
} from "./types";

const dataDir = resolve(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, "command-center.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const encode = (value: unknown) => JSON.stringify(value);
const expandHome = (path: string) =>
  path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
const decode = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const defaultChromeExecutablePath =
  process.platform === "win32"
    ? join(
        process.env.PROGRAMFILES ?? "C:\\Program Files",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      )
    : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "/usr/bin/google-chrome";

const defaultChromeUserDataDir =
  process.platform === "win32"
    ? join(
        process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
        "Google",
        "Chrome",
        "User Data",
      )
    : process.platform === "darwin"
      ? join(homedir(), "Library", "Application Support", "Google", "Chrome")
      : join(homedir(), ".config", "google-chrome");

const defaultSettings: AppSettings = {
  defaultMode: "human_review",
  minDelaySeconds: 20,
  maxDelaySeconds: 45,
  maxGroupsPerSession: 25,
  maxJoinedGroupsSyncPerRun: 500,
  joinedGroupsSyncScrollDelayMs: 1500,
  joinedGroupsSyncStopAfterNoNewPasses: 5,
  joinedGroupsSyncDefaultCategory: "Uncategorized",
  joinedGroupsSyncUrl: "https://www.facebook.com/groups/joins/",
  browserMode: "managed_playwright_profile",
  browserProfilePath: resolve(process.cwd(), "playwright-profile"),
  chromeExecutablePath: defaultChromeExecutablePath,
  chromeUserDataDir: defaultChromeUserDataDir,
  chromeProfileDirectory: "Default",
  chromeProfileSnapshotProfileDirectory: "",
  chromeProfileSnapshotImportedAt: null,
  chromeProfileSnapshotSource: "",
  stopOnCheckpoint: true,
  stopOnRepeatedFailures: true,
  defaultCategory: "Uncategorized",
  theme: "light",
  autoSubmitEnabled: true,
  facebookSessionStatus: "never_checked",
  facebookSessionCheckedAt: null,
};

db.exec(`
  create table if not exists groups (
    id text primary key,
    name text not null,
    url text not null unique,
    category text not null default 'Uncategorized',
    subcategory text not null default '',
    tags text not null default '[]',
    status text not null default 'active',
    notes text not null default '',
    source text not null default 'manual',
    sourceCapturedAt text,
    sourceUpdatedAt text,
    lastPostedAt text,
    failureCount integer not null default 0,
    createdAt text not null,
    updatedAt text not null
  );

  create table if not exists group_collections (
    id text primary key,
    name text not null,
    description text not null default '',
    createdAt text not null,
    updatedAt text not null
  );

  create table if not exists group_collection_items (
    collectionId text not null,
    groupId text not null,
    primary key (collectionId, groupId),
    foreign key (collectionId) references group_collections(id) on delete cascade,
    foreign key (groupId) references groups(id) on delete cascade
  );

  create table if not exists post_sessions (
    id text primary key,
    postText text not null,
    mode text not null default 'human_review',
    state text not null default 'draft',
    selectedGroupIds text not null,
    currentIndex integer not null default 0,
    createdAt text not null,
    updatedAt text not null,
    startedAt text,
    completedAt text
  );

  create table if not exists post_session_results (
    id text primary key,
    sessionId text not null,
    groupId text not null,
    groupName text not null,
    groupUrl text not null,
    status text not null,
    message text not null default '',
    timestamp text not null,
    durationSeconds integer not null default 0,
    foreign key (sessionId) references post_sessions(id) on delete cascade
  );

  create table if not exists settings (
    key text primary key,
    value text not null
  );
`);

const groupColumns = new Set(
  db
    .prepare("pragma table_info(groups)")
    .all()
    .map((row) => (row as { name: string }).name),
);
const addGroupColumn = (name: string, definition: string) => {
  if (!groupColumns.has(name)) db.prepare(`alter table groups add column ${definition}`).run();
};
addGroupColumn("subcategory", "subcategory text not null default ''");
addGroupColumn("source", "source text not null default 'manual'");
addGroupColumn("sourceCapturedAt", "sourceCapturedAt text");
addGroupColumn("sourceUpdatedAt", "sourceUpdatedAt text");

if (!db.prepare("select value from settings where key = 'app'").get()) {
  db.prepare("insert into settings (key, value) values ('app', ?)").run(encode(defaultSettings));
}

// The sync only ever navigates to a facebook.com groups page the user can already
// see while logged in. Anything else falls back to the default joins page.
const sanitizeJoinedGroupsSyncUrl = (url: string) => {
  try {
    const parsed = new URL(url.trim());
    const validHost =
      parsed.hostname === "facebook.com" || parsed.hostname.endsWith(".facebook.com");
    if (parsed.protocol === "https:" && validHost && parsed.pathname.startsWith("/groups")) {
      return parsed.toString();
    }
  } catch {
    // fall through to default
  }
  return defaultSettings.joinedGroupsSyncUrl;
};

const normalizeUrl = (url: string) => {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/$/, "");
  }
};

// App-owned launch directories; the Chrome source-to-copy-from must never point here.
const legacyAutomationCopyDir = resolve(process.cwd(), "data", "chrome-automation-profile");
const snapshotLaunchDir = resolve(
  process.cwd(),
  "data",
  "browser-profiles",
  "imported-facebook-profile",
);

// Value cleanup applied on every read and before every write so stored settings
// stay valid. (auto-submit is now a user-controlled toggle, no longer hard-locked.)
const normalizeSettings = (settings: AppSettings): AppSettings => {
  settings.defaultMode = "human_review";
  // "existing_chrome_profile" is the pre-snapshot name for the same intent; the app
  // no longer launches live Chrome profiles directly, only imported snapshots.
  settings.browserMode =
    settings.browserMode === "imported_chrome_profile_snapshot" ||
    (settings.browserMode as string) === "existing_chrome_profile"
      ? "imported_chrome_profile_snapshot"
      : "managed_playwright_profile";
  if (settings.minDelaySeconds > settings.maxDelaySeconds) {
    settings.maxDelaySeconds = settings.minDelaySeconds;
  }
  settings.joinedGroupsSyncUrl = sanitizeJoinedGroupsSyncUrl(settings.joinedGroupsSyncUrl);
  settings.browserProfilePath = expandHome(settings.browserProfilePath);
  settings.chromeUserDataDir = expandHome(settings.chromeUserDataDir);
  settings.chromeExecutablePath = expandHome(settings.chromeExecutablePath);
  const userDataDir = resolve(settings.chromeUserDataDir || ".");
  if (userDataDir === legacyAutomationCopyDir || userDataDir === snapshotLaunchDir) {
    settings.chromeUserDataDir = expandHome(defaultSettings.chromeUserDataDir);
  }
  return settings;
};

type GroupRow = Omit<FacebookGroup, "tags"> & { tags: string };
type SessionRow = Omit<PostSession, "selectedGroupIds"> & { selectedGroupIds: string };
type ResultRow = SessionResult;

const rowToGroup = (row: GroupRow): FacebookGroup => ({
  ...row,
  tags: decode<string[]>(row.tags, []),
  failureCount: Number(row.failureCount ?? 0),
});

const rowToSession = (row: SessionRow): PostSession => ({
  ...row,
  selectedGroupIds: decode<string[]>(row.selectedGroupIds, []),
  currentIndex: Number(row.currentIndex ?? 0),
});

const rowToResult = (row: ResultRow): SessionResult => ({
  ...row,
  durationSeconds: Number(row.durationSeconds ?? 0),
});

export const storage = {
  normalizeUrl,
  listGroups(
    filters: { search?: string; category?: string; subcategory?: string; status?: string } = {},
  ) {
    const groups = (
      db.prepare("select * from groups order by updatedAt desc").all() as GroupRow[]
    ).map(rowToGroup);
    return groups.filter((group) => {
      const haystack =
        `${group.name} ${group.url} ${group.subcategory} ${group.source}`.toLowerCase();
      return (
        (!filters.search || haystack.includes(filters.search.toLowerCase())) &&
        (!filters.category || group.category === filters.category) &&
        (!filters.subcategory || group.subcategory === filters.subcategory) &&
        (!filters.status || group.status === filters.status)
      );
    });
  },
  getGroup(groupId: string) {
    const row = db.prepare("select * from groups where id = ?").get(groupId) as
      | GroupRow
      | undefined;
    return row ? rowToGroup(row) : null;
  },
  getGroupByUrl(url: string) {
    const row = db.prepare("select * from groups where url = ?").get(normalizeUrl(url)) as
      | GroupRow
      | undefined;
    return row ? rowToGroup(row) : null;
  },
  upsertGroup(input: Partial<FacebookGroup> & { name: string; url: string }) {
    const timestamp = now();
    const existingRow = db
      .prepare("select * from groups where url = ?")
      .get(normalizeUrl(input.url)) as GroupRow | undefined;
    const existing = existingRow ? rowToGroup(existingRow) : undefined;
    const group: FacebookGroup = {
      id: existing?.id ?? input.id ?? id("grp"),
      name: input.name.trim(),
      url: normalizeUrl(input.url),
      category: input.category?.trim() || "Uncategorized",
      subcategory:
        input.subcategory !== undefined ? input.subcategory.trim() : (existing?.subcategory ?? ""),
      tags: input.tags ?? existing?.tags ?? [],
      status: (input.status as GroupStatus) ?? existing?.status ?? "active",
      notes: input.notes ?? "",
      source: input.source?.trim() || existing?.source || "manual",
      sourceCapturedAt: input.sourceCapturedAt ?? existing?.sourceCapturedAt ?? null,
      sourceUpdatedAt: input.sourceUpdatedAt ?? existing?.sourceUpdatedAt ?? null,
      lastPostedAt: input.lastPostedAt ?? existing?.lastPostedAt ?? null,
      failureCount: input.failureCount ?? existing?.failureCount ?? 0,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    db.prepare(
      `
      insert into groups (id, name, url, category, subcategory, tags, status, notes, source, sourceCapturedAt, sourceUpdatedAt, lastPostedAt, failureCount, createdAt, updatedAt)
      values (@id, @name, @url, @category, @subcategory, @tags, @status, @notes, @source, @sourceCapturedAt, @sourceUpdatedAt, @lastPostedAt, @failureCount, @createdAt, @updatedAt)
      on conflict(url) do update set
        name = excluded.name,
        category = excluded.category,
        subcategory = excluded.subcategory,
        tags = excluded.tags,
        status = excluded.status,
        notes = excluded.notes,
        source = excluded.source,
        sourceCapturedAt = excluded.sourceCapturedAt,
        sourceUpdatedAt = excluded.sourceUpdatedAt,
        updatedAt = excluded.updatedAt
    `,
    ).run({ ...group, tags: encode(group.tags) });
    return group;
  },
  // Import commit: all rows succeed or none do. A bad row rolls the whole batch
  // back instead of leaving a partial import that looks like a failure in the UI.
  upsertGroups(rows: Array<Partial<FacebookGroup> & { name: string; url: string }>) {
    const tx = db.transaction(
      (batch: Array<Partial<FacebookGroup> & { name: string; url: string }>) =>
        batch.map((row) => this.upsertGroup(row)),
    );
    return tx(rows);
  },
  updateGroup(groupId: string, input: Partial<FacebookGroup>) {
    const existing = this.getGroup(groupId);
    if (!existing) return null;
    return this.upsertGroup({ ...existing, ...input, id: groupId, url: input.url ?? existing.url });
  },
  archiveGroup(groupId: string) {
    db.prepare("update groups set status = 'removed', updatedAt = ? where id = ?").run(
      now(),
      groupId,
    );
  },
  deleteGroup(groupId: string) {
    db.prepare("delete from groups where id = ?").run(groupId);
  },
  categories() {
    return db
      .prepare("select distinct category from groups where category != '' order by category")
      .all()
      .map((row) => (row as { category: string }).category);
  },
  subcategories(category?: string) {
    const rows = category
      ? db
          .prepare(
            "select distinct subcategory from groups where subcategory != '' and category = ? order by subcategory",
          )
          .all(category)
      : db
          .prepare(
            "select distinct subcategory from groups where subcategory != '' order by subcategory",
          )
          .all();
    return rows.map((row) => (row as { subcategory: string }).subcategory);
  },
  collections(): GroupCollection[] {
    const collections = db.prepare("select * from group_collections order by updatedAt desc").all();
    return collections.map((collection) => ({
      ...(collection as Omit<GroupCollection, "groupIds">),
      groupIds: db
        .prepare("select groupId from group_collection_items where collectionId = ?")
        .all((collection as { id: string }).id)
        .map((row) => (row as { groupId: string }).groupId),
    }));
  },
  saveCollection(input: { id?: string; name: string; description?: string; groupIds: string[] }) {
    const timestamp = now();
    const collection = {
      id: input.id ?? id("col"),
      name: input.name,
      description: input.description ?? "",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    db.prepare(
      `
      insert into group_collections (id, name, description, createdAt, updatedAt)
      values (@id, @name, @description, @createdAt, @updatedAt)
      on conflict(id) do update set name = excluded.name, description = excluded.description, updatedAt = excluded.updatedAt
    `,
    ).run(collection);
    db.prepare("delete from group_collection_items where collectionId = ?").run(collection.id);
    const insert = db.prepare(
      "insert or ignore into group_collection_items (collectionId, groupId) values (?, ?)",
    );
    const tx = db.transaction((groupIds: string[]) =>
      groupIds.forEach((groupId) => insert.run(collection.id, groupId)),
    );
    tx(input.groupIds);
    return { ...collection, groupIds: input.groupIds };
  },
  getSettings(): AppSettings {
    const row = db.prepare("select value from settings where key = 'app'").get() as
      | { value: string }
      | undefined;
    const settings = normalizeSettings({
      ...defaultSettings,
      ...decode<Partial<AppSettings>>(row?.value, {}),
    });
    mkdirSync(dirname(settings.browserProfilePath), { recursive: true });
    return settings;
  },
  updateSettings(input: Partial<AppSettings>) {
    const settings = normalizeSettings({ ...this.getSettings(), ...input });
    db.prepare(
      "insert into settings (key, value) values ('app', ?) on conflict(key) do update set value = excluded.value",
    ).run(encode(settings));
    return settings;
  },
  createSession(postText: string, selectedGroupIds: string[]) {
    const timestamp = now();
    const session: PostSession = {
      id: id("ses"),
      postText,
      mode: "human_review",
      state: "draft",
      selectedGroupIds,
      currentIndex: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      startedAt: null,
      completedAt: null,
    };
    db.prepare(
      `
      insert into post_sessions (id, postText, mode, state, selectedGroupIds, currentIndex, createdAt, updatedAt, startedAt, completedAt)
      values (@id, @postText, @mode, @state, @selectedGroupIds, @currentIndex, @createdAt, @updatedAt, @startedAt, @completedAt)
    `,
    ).run({ ...session, selectedGroupIds: encode(selectedGroupIds) });
    return session;
  },
  getSession(sessionId: string) {
    const row = db.prepare("select * from post_sessions where id = ?").get(sessionId) as
      | SessionRow
      | undefined;
    return row ? rowToSession(row) : null;
  },
  latestSession() {
    const row = db.prepare("select * from post_sessions order by createdAt desc limit 1").get() as
      | SessionRow
      | undefined;
    return row ? rowToSession(row) : null;
  },
  updateSession(sessionId: string, patch: Partial<PostSession>) {
    const existing = this.getSession(sessionId);
    if (!existing) return null;
    const session = { ...existing, ...patch, updatedAt: now() };
    db.prepare(
      `
      update post_sessions set postText = @postText, mode = @mode, state = @state, selectedGroupIds = @selectedGroupIds,
      currentIndex = @currentIndex, updatedAt = @updatedAt, startedAt = @startedAt, completedAt = @completedAt where id = @id
    `,
    ).run({ ...session, selectedGroupIds: encode(session.selectedGroupIds) });
    return session;
  },
  addResult(input: Omit<SessionResult, "id" | "timestamp">) {
    const result: SessionResult = { ...input, id: id("res"), timestamp: now() };
    db.prepare(
      `
      insert into post_session_results (id, sessionId, groupId, groupName, groupUrl, status, message, timestamp, durationSeconds)
      values (@id, @sessionId, @groupId, @groupName, @groupUrl, @status, @message, @timestamp, @durationSeconds)
    `,
    ).run(result);
    if (result.status === "posted") {
      db.prepare(
        "update groups set lastPostedAt = ?, failureCount = 0, updatedAt = ? where id = ?",
      ).run(result.timestamp, result.timestamp, result.groupId);
    }
    if (result.status === "failed" || result.status === "needs_review") {
      db.prepare(
        "update groups set status = ?, failureCount = failureCount + 1, updatedAt = ? where id = ?",
      ).run(
        result.status === "failed" ? "failed" : "needs_review",
        result.timestamp,
        result.groupId,
      );
    }
    return result;
  },
  listResults(sessionId?: string) {
    const sql = sessionId
      ? "select * from post_session_results where sessionId = ? order by timestamp desc"
      : "select * from post_session_results order by timestamp desc limit 250";
    return (
      sessionId
        ? (db.prepare(sql).all(sessionId) as ResultRow[])
        : (db.prepare(sql).all() as ResultRow[])
    ).map(rowToResult);
  },
  resultForGroup(sessionId: string, groupId: string) {
    const row = db
      .prepare(
        "select * from post_session_results where sessionId = ? and groupId = ? order by timestamp desc limit 1",
      )
      .get(sessionId, groupId) as ResultRow | undefined;
    return row ? rowToResult(row) : null;
  },
  history() {
    return (
      db
        .prepare("select * from post_sessions order by createdAt desc limit 100")
        .all() as SessionRow[]
    ).map(rowToSession);
  },
};

export const delay = (ms: number) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
export const randomId = id;
export const timestamp = now;

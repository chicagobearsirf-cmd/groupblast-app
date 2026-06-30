import { requireSupabaseClient, type SupabaseClient } from "@/lib/supabase";
import type { FacebookGroup, SessionResult } from "@/types";
import type { ActivityLogEntry, Campaign, DataStore } from "./types";

// --- small coercion helpers (Supabase rows are loosely typed) ---------------
type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" ? v : v == null ? null : String(v);
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v) || 0);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

function mapGroupRow(row: Row): FacebookGroup {
  return {
    id: str(row.id),
    name: str(row.name),
    url: str(row.url),
    category: str(row.category),
    subcategory: str(row.subcategory),
    tags: strArr(row.tags),
    status: (str(row.status) || "active") as FacebookGroup["status"],
    notes: str(row.notes),
    source: str(row.source),
    sourceCapturedAt: strOrNull(row.captured_at),
    sourceUpdatedAt: strOrNull(row.updated_at),
    lastPostedAt: strOrNull(row.last_posted_at),
    failureCount: num(row.failure_count),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function mapResultRow(row: Row): SessionResult {
  return {
    id: str(row.id),
    sessionId: str(row.session_id),
    groupId: str(row.group_id),
    groupName: str(row.group_name),
    groupUrl: str(row.group_url),
    status: (str(row.status) || "needs_review") as SessionResult["status"],
    message: str(row.reason),
    timestamp: str(row.created_at),
    durationSeconds: num(row.duration_seconds),
  };
}

function mapCampaignRow(row: Row): Campaign {
  return {
    id: str(row.id),
    name: str(row.name),
    status: (str(row.status) || "draft") as Campaign["status"],
    createdAt: str(row.created_at),
  };
}

async function getMyTeamId(client: SupabaseClient): Promise<string> {
  const { data: auth } = await client.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("You must be signed in to use cloud data.");
  const { data, error } = await client
    .from("team_members")
    .select("team_id")
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not resolve your team: ${error.message}`);
  const teamId = data ? str((data as Row).team_id) : "";
  if (!teamId) throw new Error("You are not a member of any team yet.");
  return teamId;
}

/**
 * Cloud data store (Supabase). Reads are RLS-scoped to the signed-in user's team,
 * so a plain select only returns rows they're allowed to see. Errors surface the
 * Supabase message rather than silently returning empty/wrong data.
 */
export class CloudDataStore implements DataStore {
  readonly kind = "supabase" as const;

  async listGroups(): Promise<FacebookGroup[]> {
    const client = requireSupabaseClient();
    const { data, error } = await client
      .from("groups")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Supabase listGroups failed: ${error.message}`);
    return ((data ?? []) as Row[]).map(mapGroupRow);
  }

  async listSessionResults(): Promise<SessionResult[]> {
    const client = requireSupabaseClient();
    const { data, error } = await client
      .from("post_session_results")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Supabase listSessionResults failed: ${error.message}`);
    return ((data ?? []) as Row[]).map(mapResultRow);
  }

  async listCampaigns(): Promise<Campaign[]> {
    const client = requireSupabaseClient();
    const { data, error } = await client
      .from("campaigns")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Supabase listCampaigns failed: ${error.message}`);
    return ((data ?? []) as Row[]).map(mapCampaignRow);
  }

  async createCampaign(input: { name: string }): Promise<Campaign> {
    const client = requireSupabaseClient();
    const teamId = await getMyTeamId(client);
    const { data, error } = await client
      .from("campaigns")
      .insert({ name: input.name, team_id: teamId })
      .select("*")
      .single();
    if (error) throw new Error(`Supabase createCampaign failed: ${error.message}`);
    return mapCampaignRow(data as Row);
  }

  async recordActivity(entry: ActivityLogEntry): Promise<void> {
    const client = requireSupabaseClient();
    const teamId = await getMyTeamId(client);
    const { data: auth } = await client.auth.getUser();
    const { error } = await client.from("activity_logs").insert({
      team_id: teamId,
      actor_id: auth.user?.id ?? null,
      action: entry.action,
      metadata: entry.metadata ?? null,
    });
    if (error) throw new Error(`Supabase recordActivity failed: ${error.message}`);
  }
}

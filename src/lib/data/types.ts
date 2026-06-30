import type { FacebookGroup, SessionResult } from "@/types";

// Cloud-first entities not present in the local SQLite model yet.
export type Campaign = {
  id: string;
  name: string;
  status: "draft" | "active" | "paused" | "archived";
  createdAt: string;
};

export type ActivityLogEntry = {
  action: string;
  metadata?: Record<string, unknown>;
};

export type DataStoreKind = "local" | "supabase";

/**
 * Storage-agnostic surface so feature code can target ONE interface and the app
 * can switch between the local SQLite API and Supabase based on VITE_APP_MODE.
 *
 * - local  -> LocalApiDataStore (SQLite via the local Express API)
 * - cloud / hybrid -> CloudDataStore (Supabase, RLS-scoped to the user's team)
 */
export interface DataStore {
  readonly kind: DataStoreKind;

  // Shared between local and cloud.
  listGroups(): Promise<FacebookGroup[]>;
  listSessionResults(): Promise<SessionResult[]>;

  // Cloud-first (shared, multi-rep). The local store reports these as unavailable.
  listCampaigns(): Promise<Campaign[]>;
  createCampaign(input: { name: string }): Promise<Campaign>;
  recordActivity(entry: ActivityLogEntry): Promise<void>;
}

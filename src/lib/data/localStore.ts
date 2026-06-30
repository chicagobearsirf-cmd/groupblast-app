import { api } from "@/lib/api";
import type { FacebookGroup, SessionResult } from "@/types";
import type { Campaign, DataStore } from "./types";

/**
 * Backed by the local Express API (SQLite + Playwright). This is the working,
 * default data store and is what local + hybrid modes use for automation data.
 */
export class LocalApiDataStore implements DataStore {
  readonly kind = "local" as const;

  listGroups(): Promise<FacebookGroup[]> {
    return api.groups();
  }

  async listSessionResults(): Promise<SessionResult[]> {
    const history = await api.history();
    return history.results;
  }

  // Campaigns are a cloud concept (shared, multi-rep). The local model uses
  // ad-hoc post sessions instead, so there is nothing to list here.
  async listCampaigns(): Promise<Campaign[]> {
    return [];
  }

  async createCampaign(): Promise<Campaign> {
    throw new Error(
      "Campaigns are a cloud feature. Set VITE_APP_MODE to cloud or hybrid (with Supabase configured) to use them.",
    );
  }

  // Local activity is already logged in SQLite via the API; nothing extra to do.
  async recordActivity(): Promise<void> {
    return;
  }
}

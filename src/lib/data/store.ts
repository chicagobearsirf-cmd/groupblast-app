import { usesCloudData } from "@/lib/app-mode";
import { CloudDataStore } from "./cloudStore";
import { LocalApiDataStore } from "./localStore";
import type { DataStore } from "./types";

export type { DataStore, DataStoreKind, Campaign, ActivityLogEntry } from "./types";
export { LocalApiDataStore } from "./localStore";
export { CloudDataStore } from "./cloudStore";

let store: DataStore | null = null;

/**
 * The data store for the current VITE_APP_MODE:
 *   - local  -> LocalApiDataStore (SQLite + local API)
 *   - cloud / hybrid -> CloudDataStore (Supabase, RLS team-scoped)
 *
 * Memoized after first call. Feature code should depend on the DataStore
 * interface, not a concrete store, so switching modes needs no rewrites.
 */
export function getDataStore(): DataStore {
  if (store) return store;
  store = usesCloudData() ? new CloudDataStore() : new LocalApiDataStore();
  return store;
}

// Central place to read which environment the app is running in. Default is
// "local" so the existing single-machine workflow is unchanged when no env is set.
//
//   local  = SQLite + local Playwright API (today's default)
//   cloud  = Supabase data only, NO Facebook automation (hosted dashboard)
//   hybrid = cloud dashboard + a local agent/extension for automation
//
// See docs/CLOUD_ARCHITECTURE.md.

export type AppMode = "local" | "cloud" | "hybrid";

export function getAppMode(): AppMode {
  const raw = String(import.meta.env.VITE_APP_MODE ?? "local").toLowerCase();
  return raw === "cloud" || raw === "hybrid" ? raw : "local";
}

export function getCloudConfig(): {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
} {
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string | undefined,
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
  };
}

/** True when Supabase URL + anon key are present (required for cloud/hybrid). */
export function isCloudConfigured(): boolean {
  const { supabaseUrl, supabaseAnonKey } = getCloudConfig();
  return Boolean(supabaseUrl && supabaseAnonKey);
}

/**
 * Whether the Facebook automation (Playwright: launch browser, session check,
 * joined-group sync, composer fill) is available. Only `cloud` mode lacks it —
 * there is no local agent reachable from a pure hosted dashboard.
 */
export function localAutomationAvailable(): boolean {
  return getAppMode() !== "cloud";
}

/** True when the cloud data layer (Supabase) is the source of truth. */
export function usesCloudData(): boolean {
  return getAppMode() !== "local";
}

/** Snapshot for UI/diagnostics. */
export function getAppModeInfo() {
  const mode = getAppMode();
  return {
    mode,
    cloudConfigured: isCloudConfigured(),
    localAutomationAvailable: mode !== "cloud",
    usesCloudData: mode !== "local",
  };
}

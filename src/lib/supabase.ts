// Single Supabase client for the whole app. Optional + lazy: returns null until
// VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set, so importing this never
// breaks local mode. Public anon key only — never the service role key (that is
// server-only; see .env.example / config.server.ts).

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { getCloudConfig, isCloudConfigured } from "@/lib/app-mode";

let cached: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!isCloudConfigured()) return null;
  if (cached) return cached;
  const { supabaseUrl, supabaseAnonKey } = getCloudConfig();
  cached = createClient(supabaseUrl as string, supabaseAnonKey as string, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return cached;
}

/** Throwing accessor for code paths that require cloud to be configured. */
export function requireSupabaseClient(): SupabaseClient {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for cloud/hybrid mode.",
    );
  }
  return client;
}

export function isSupabaseReady(): boolean {
  return getSupabaseClient() !== null;
}

export type { Session, SupabaseClient };

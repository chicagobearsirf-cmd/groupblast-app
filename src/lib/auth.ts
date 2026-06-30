// User roles + current-user foundation.
//
// Phase 1: in local mode there is a single operator, treated as `admin` on their
// own machine. Cloud/hybrid auth (Supabase sign-in + real role enforcement via
// RLS) is wired in Phase 2; see docs/CLOUD_ARCHITECTURE.md.

import { getAppMode } from "@/lib/app-mode";

export type UserRole = "admin" | "rep";

export type CurrentUser = {
  id: string | null;
  email: string | null;
  role: UserRole;
  /** Where the identity came from. */
  source: "local" | "supabase";
};

/** The implicit local operator: full access on their own machine. */
export function getLocalCurrentUser(): CurrentUser {
  return { id: null, email: null, role: "admin", source: "local" };
}

/**
 * Current user. In local mode this is the local operator (admin). In cloud/hybrid
 * mode this will read the Supabase session (Phase 2); until then it falls back to
 * a rep with no id so admin-only UI stays hidden when unauthenticated.
 */
export function getCurrentUser(): CurrentUser {
  if (getAppMode() === "local") return getLocalCurrentUser();
  // Phase 2: read Supabase auth session here.
  return { id: null, email: null, role: "rep", source: "supabase" };
}

export function isAdmin(user: CurrentUser = getCurrentUser()): boolean {
  return user.role === "admin";
}

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getAppMode, type AppMode } from "@/lib/app-mode";
import { getLocalCurrentUser, type CurrentUser, type UserRole } from "@/lib/auth";
import { getSupabaseClient, requireSupabaseClient, type Session } from "@/lib/supabase";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: CurrentUser | null;
  mode: AppMode;
  /** True in cloud/hybrid mode without a configured Supabase project. */
  cloudUnavailable: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signUp: (email: string, password: string, fullName?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function sessionToUser(session: Session | null): Promise<CurrentUser | null> {
  const client = getSupabaseClient();
  if (!client || !session?.user) return null;
  let role: UserRole = "rep";
  try {
    const { data } = await client
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle();
    const r = (data as { role?: string } | null)?.role;
    if (r === "admin" || r === "rep") role = r;
  } catch {
    // profiles table may not exist yet (pre-migration); default to rep.
  }
  return { id: session.user.id, email: session.user.email ?? null, role, source: "supabase" };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const mode = getAppMode();
  const [status, setStatus] = useState<AuthStatus>(mode === "local" ? "authenticated" : "loading");
  const [user, setUser] = useState<CurrentUser | null>(
    mode === "local" ? getLocalCurrentUser() : null,
  );

  useEffect(() => {
    if (mode === "local") return;
    const client = getSupabaseClient();
    if (!client) {
      setStatus("unauthenticated");
      setUser(null);
      return;
    }
    let active = true;
    (async () => {
      const { data } = await client.auth.getSession();
      const u = await sessionToUser(data.session);
      if (!active) return;
      setUser(u);
      setStatus(u ? "authenticated" : "unauthenticated");
    })();
    const { data: sub } = client.auth.onAuthStateChange(async (_event, session) => {
      const u = await sessionToUser(session);
      if (!active) return;
      setUser(u);
      setStatus(u ? "authenticated" : "unauthenticated");
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [mode]);

  const signIn = async (email: string, password: string) => {
    const client = requireSupabaseClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signInWithMagicLink = async (email: string) => {
    const client = requireSupabaseClient();
    const { error } = await client.auth.signInWithOtp({ email });
    if (error) throw new Error(error.message);
  };

  const signUp = async (email: string, password: string, fullName?: string) => {
    const client = requireSupabaseClient();
    const { error } = await client.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName ?? "" } },
    });
    if (error) throw new Error(error.message);
  };

  const signOut = async () => {
    const client = getSupabaseClient();
    if (client) await client.auth.signOut();
  };

  const value: AuthContextValue = {
    status,
    user,
    mode,
    cloudUnavailable: mode !== "local" && getSupabaseClient() === null,
    signIn,
    signInWithMagicLink,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider.");
  return ctx;
}

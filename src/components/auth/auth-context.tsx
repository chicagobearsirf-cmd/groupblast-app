import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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
  /** True while polling for magic-link completion after sending the email. */
  awaitingMagicLink: boolean;
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
  const [awaitingMagicLink, setAwaitingMagicLink] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setAwaitingMagicLink(false);
  }, []);

  const applySession = useCallback(async (session: Session | null) => {
    const u = await sessionToUser(session);
    setUser(u);
    setStatus(u ? "authenticated" : "unauthenticated");
    if (u) stopPolling();
  }, [stopPolling]);

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
      if (!active) return;
      await applySession(data.session);
    })();
    const { data: sub } = client.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;
      await applySession(session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [mode, applySession]);

  // Clean up polling on unmount.
  useEffect(() => stopPolling, [stopPolling]);

  const signIn = async (email: string, password: string) => {
    const client = requireSupabaseClient();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  };

  const signInWithMagicLink = async (email: string) => {
    const client = requireSupabaseClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "http://localhost:8080/auth-callback" },
    });
    if (error) throw new Error(error.message);

    // In Electron the magic link opens in the system browser, not this window.
    // The callback page posts tokens to the local API relay. Poll it here.
    stopPolling();
    setAwaitingMagicLink(true);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("http://localhost:3001/api/auth/session-relay");
        const data = await res.json();
        if (data.session) {
          const { error: setErr } = await client.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          });
          if (!setErr) {
            const { data: sessionData } = await client.auth.getSession();
            await applySession(sessionData.session);
          }
        }
      } catch {
        // API may not be ready yet; ignore and retry.
      }
    }, 2000);
    // Stop after 10 minutes to avoid polling forever.
    setTimeout(stopPolling, 10 * 60 * 1000);
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
    awaitingMagicLink,
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

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-context";
import { getSupabaseClient } from "@/lib/supabase";

export type PlanStatus = "trial" | "active" | "expired" | "pilot" | "unknown";

type PlanStatusState = {
  status: PlanStatus;
  hasAccess: boolean;
  isPilot: boolean;
  trialEndsAt: string | null;
  daysRemaining: number;
  aiAccess: boolean;
  isLoading: boolean;
};

const localAccess: PlanStatusState = {
  status: "active",
  hasAccess: true,
  isPilot: false,
  trialEndsAt: null,
  daysRemaining: 0,
  aiAccess: false,
  isLoading: false,
};

const loadingState: PlanStatusState = {
  status: "unknown",
  hasAccess: false,
  isPilot: false,
  trialEndsAt: null,
  daysRemaining: 0,
  aiAccess: false,
  isLoading: true,
};

type PlanStatusRpc = {
  status?: string;
  has_access?: boolean;
  is_pilot?: boolean;
  trial_ends_at?: string | null;
  days_remaining?: number;
  ai_access?: boolean;
};

export function usePlanStatus(): PlanStatusState {
  const { mode, status: authStatus, user } = useAuth();
  const [state, setState] = useState<PlanStatusState>(
    mode === "local" ? localAccess : loadingState,
  );

  const refresh = useCallback(async () => {
    if (mode === "local") {
      setState(localAccess);
      return;
    }

    if (authStatus !== "authenticated" || !user?.id) {
      setState({ ...loadingState, isLoading: authStatus === "loading" });
      return;
    }

    const client = getSupabaseClient();
    if (!client) {
      setState({
        status: "expired",
        hasAccess: false,
        isPilot: false,
        trialEndsAt: null,
        daysRemaining: 0,
        aiAccess: false,
        isLoading: false,
      });
      return;
    }

    setState((current) => ({ ...current, isLoading: true }));
    const { data, error } = await client.rpc("check_trial_status", { p_user_id: user.id });
    if (error) {
      setState({
        status: "expired",
        hasAccess: false,
        isPilot: false,
        trialEndsAt: null,
        daysRemaining: 0,
        aiAccess: false,
        isLoading: false,
      });
      return;
    }

    const payload = (data ?? {}) as PlanStatusRpc;
    const status =
      payload.status === "trial" ||
      payload.status === "active" ||
      payload.status === "expired" ||
      payload.status === "pilot"
        ? payload.status
        : "unknown";

    setState({
      status,
      hasAccess: Boolean(payload.has_access),
      isPilot: Boolean(payload.is_pilot),
      trialEndsAt: payload.trial_ends_at ?? null,
      daysRemaining: Number(payload.days_remaining ?? 0),
      aiAccess: Boolean(payload.ai_access),
      isLoading: false,
    });
  }, [authStatus, mode, user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (mode === "local") return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [mode, refresh]);

  return state;
}

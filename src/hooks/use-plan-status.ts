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
  aiTrialActive: boolean;
  aiTrialUsed: boolean;
  aiTrialEndsAt: string | null;
  aiDiscountCode: string | null;
  aiDiscountCents: number;
  isLoading: boolean;
  promoCode: string | null;
  discountPercent: number;
};

const localAccess: PlanStatusState = {
  status: "active",
  hasAccess: true,
  isPilot: false,
  trialEndsAt: null,
  daysRemaining: 0,
  aiAccess: false,
  aiTrialActive: false,
  aiTrialUsed: false,
  aiTrialEndsAt: null,
  aiDiscountCode: null,
  aiDiscountCents: 0,
  isLoading: false,
  promoCode: null,
  discountPercent: 0,
};

const loadingState: PlanStatusState = {
  status: "unknown",
  hasAccess: false,
  isPilot: false,
  trialEndsAt: null,
  daysRemaining: 0,
  aiAccess: false,
  aiTrialActive: false,
  aiTrialUsed: false,
  aiTrialEndsAt: null,
  aiDiscountCode: null,
  aiDiscountCents: 0,
  isLoading: true,
  promoCode: null,
  discountPercent: 0,
};

type PlanStatusRpc = {
  status?: string;
  has_access?: boolean;
  is_pilot?: boolean;
  trial_ends_at?: string | null;
  days_remaining?: number;
  ai_access?: boolean;
  ai_trial_active?: boolean;
  ai_trial_used?: boolean;
  ai_trial_ends_at?: string | null;
  ai_discount_code?: string | null;
  ai_discount_cents?: number;
  promo_code?: string | null;
  discount_percent?: number;
};

type ApplyPromoCodeResult = { ok: boolean; discountPercent?: number; error?: string };

// Stable machine ID from the local API, used server-side to stop the same
// machine from farming fresh trials with new emails. Cached for the session.
let cachedDeviceId: string | null = null;
async function getDeviceId(): Promise<string | null> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const res = await fetch("http://localhost:3001/api/device-id");
    const data = (await res.json()) as { deviceId?: string };
    cachedDeviceId = data.deviceId ?? null;
  } catch {
    cachedDeviceId = null;
  }
  return cachedDeviceId;
}

export function usePlanStatus(): PlanStatusState & {
  applyPromoCode: (code: string) => Promise<ApplyPromoCodeResult>;
  refresh: () => Promise<void>;
} {
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

    const expiredFallback: PlanStatusState = {
      ...loadingState,
      status: "expired",
      isLoading: false,
    };

    const client = getSupabaseClient();
    if (!client) {
      setState(expiredFallback);
      return;
    }

    setState((current) => ({ ...current, isLoading: true }));
    const deviceId = await getDeviceId();
    const { data, error } = await client.rpc("check_trial_status", {
      p_user_id: user.id,
      p_device_id: deviceId,
    });
    if (error) {
      setState(expiredFallback);
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
      aiTrialActive: Boolean(payload.ai_trial_active),
      aiTrialUsed: Boolean(payload.ai_trial_used),
      aiTrialEndsAt: payload.ai_trial_ends_at ?? null,
      aiDiscountCode: payload.ai_discount_code ?? null,
      aiDiscountCents: Number(payload.ai_discount_cents ?? 0),
      isLoading: false,
      promoCode: payload.promo_code ?? null,
      discountPercent: Number(payload.discount_percent ?? 0),
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

  const applyPromoCode = useCallback(
    async (code: string): Promise<{ ok: boolean; discountPercent?: number; error?: string }> => {
      if (mode === "local" || !user?.id) return { ok: false, error: "not_authenticated" };
      const client = getSupabaseClient();
      if (!client) return { ok: false, error: "not_configured" };

      const { data, error } = await client.rpc("apply_promo_code", {
        p_user_id: user.id,
        p_code: code,
      });
      if (error) return { ok: false, error: error.message };

      const result = (data ?? {}) as { ok?: boolean; discount_percent?: number; error?: string };
      if (result.ok) {
        await refresh();
        return { ok: true, discountPercent: Number(result.discount_percent ?? 0) };
      }
      return { ok: false, error: result.error ?? "invalid_code" };
    },
    [mode, user?.id, refresh],
  );

  return { ...state, applyPromoCode, refresh };
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/notify";
import { getSupabaseClient } from "@/lib/supabase";

export type AdminStats = {
  totalUsers: number;
  trialing: number;
  active: number;
  expired: number;
  pilots: number;
  admins: number;
};

export type AdminCustomer = {
  userId: string;
  email: string | null;
  plan: string;
  isPilot: boolean;
  isAdmin: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  promoCode: string | null;
  discountPercent: number;
  createdAt: string | null;
};

export type AdminPromoCode = {
  code: string;
  affiliateName: string | null;
  affiliateContact: string | null;
  discountPercent: number;
  commissionPercent: number;
  payingCustomers: number;
  trialingCustomers: number;
};

type AdminCustomerRpc = {
  user_id?: string;
  email?: string | null;
  plan?: string;
  is_pilot?: boolean;
  is_admin?: boolean;
  trial_started_at?: string | null;
  trial_ends_at?: string | null;
  promo_code?: string | null;
  discount_percent?: number;
  created_at?: string | null;
};

type AdminPromoCodeRpc = {
  code?: string;
  affiliate_name?: string | null;
  affiliate_contact?: string | null;
  discount_percent?: number;
  commission_percent?: number;
  paying_customers?: number;
  trialing_customers?: number;
};

type AdminStatsRpc = {
  total_users?: number;
  trialing?: number;
  active?: number;
  expired?: number;
  pilots?: number;
  admins?: number;
};

export const adminQueryKeys = {
  stats: ["admin", "stats"] as const,
  customers: ["admin", "customers"] as const,
  promoCodes: ["admin", "promo-codes"] as const,
};

function requireClient() {
  const client = getSupabaseClient();
  if (!client) throw new Error("Supabase is not configured.");
  return client;
}

function requireArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function mapCustomer(row: AdminCustomerRpc): AdminCustomer {
  return {
    userId: row.user_id ?? "",
    email: row.email ?? null,
    plan: row.plan ?? "unknown",
    isPilot: Boolean(row.is_pilot),
    isAdmin: Boolean(row.is_admin),
    trialStartedAt: row.trial_started_at ?? null,
    trialEndsAt: row.trial_ends_at ?? null,
    promoCode: row.promo_code ?? null,
    discountPercent: Number(row.discount_percent ?? 0),
    createdAt: row.created_at ?? null,
  };
}

function mapPromoCode(row: AdminPromoCodeRpc): AdminPromoCode {
  return {
    code: row.code ?? "",
    affiliateName: row.affiliate_name ?? null,
    affiliateContact: row.affiliate_contact ?? null,
    discountPercent: Number(row.discount_percent ?? 0),
    commissionPercent: Number(row.commission_percent ?? 0),
    payingCustomers: Number(row.paying_customers ?? 0),
    trialingCustomers: Number(row.trialing_customers ?? 0),
  };
}

export function useAdminStats(enabled: boolean) {
  return useQuery({
    queryKey: adminQueryKeys.stats,
    enabled,
    queryFn: async (): Promise<AdminStats> => {
      const client = requireClient();
      const { data, error } = await client.rpc("admin_stats");
      if (error) throw new Error(error.message);
      const row = (data ?? {}) as AdminStatsRpc;
      return {
        totalUsers: Number(row.total_users ?? 0),
        trialing: Number(row.trialing ?? 0),
        active: Number(row.active ?? 0),
        expired: Number(row.expired ?? 0),
        pilots: Number(row.pilots ?? 0),
        admins: Number(row.admins ?? 0),
      };
    },
  });
}

export function useAdminCustomers(enabled: boolean) {
  return useQuery({
    queryKey: adminQueryKeys.customers,
    enabled,
    queryFn: async (): Promise<AdminCustomer[]> => {
      const client = requireClient();
      const { data, error } = await client.rpc("admin_list_customers");
      if (error) throw new Error(error.message);
      return requireArray<AdminCustomerRpc>(data).map(mapCustomer);
    },
  });
}

export function useAdminPromoCodes(enabled: boolean) {
  return useQuery({
    queryKey: adminQueryKeys.promoCodes,
    enabled,
    queryFn: async (): Promise<AdminPromoCode[]> => {
      const client = requireClient();
      const { data, error } = await client.rpc("admin_list_promo_codes");
      if (error) throw new Error(error.message);
      return requireArray<AdminPromoCodeRpc>(data).map(mapPromoCode);
    },
  });
}

export function useUpdatePromoAffiliate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code: string;
      affiliateName: string;
      affiliateContact: string;
    }) => {
      const client = requireClient();
      const { error } = await client.rpc("admin_set_promo_affiliate", {
        p_code: input.code,
        p_name: input.affiliateName,
        p_contact: input.affiliateContact,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.promoCodes });
      toast.success("Partner code updated.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Update failed."),
  });
}

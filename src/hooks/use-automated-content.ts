// Data layer for the Automated Content add-on. Everything here talks to
// Supabase (profile, drafts, the generate-content Edge Function) — nothing
// touches the local automation API.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-context";
import { getSupabaseClient } from "@/lib/supabase";

export type BusinessProfile = {
  business_name: string;
  business_type: string;
  service_area: string;
  target_customer: string;
  tone: string;
  offers: string;
  differentiator: string;
  never_say: string;
  completed: boolean;
};

export const emptyProfile: BusinessProfile = {
  business_name: "",
  business_type: "",
  service_area: "",
  target_customer: "",
  tone: "",
  offers: "",
  differentiator: "",
  never_say: "",
  completed: false,
};

export type ContentDraft = {
  id: string;
  topic: string;
  goal: string;
  caption: string;
  image_url: string | null;
  updated_at: string;
};

export type GenerateKind = "generate" | "regen_text" | "regen_image" | "tweak";

export type GenerateResult = {
  caption: string;
  imageUrl: string | null;
  usage: { gensUsed: number; gensCap: number; premiumUsed: number; premiumCap: number };
};

const profileKey = ["automated-content", "profile"] as const;
const draftsKey = ["automated-content", "drafts"] as const;
const usageKey = ["automated-content", "usage"] as const;

export function useBusinessProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: profileKey,
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<BusinessProfile | null> => {
      const client = getSupabaseClient();
      if (!client || !user?.id) return null;
      const { data, error } = await client
        .from("business_profiles")
        .select(
          "business_name, business_type, service_area, target_customer, tone, offers, differentiator, never_say, completed",
        )
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as BusinessProfile | null) ?? null;
    },
  });
}

export function useSaveBusinessProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: BusinessProfile) => {
      const client = getSupabaseClient();
      if (!client || !user?.id) throw new Error("Not signed in.");
      const { error } = await client
        .from("business_profiles")
        .upsert({ user_id: user.id, ...profile });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: profileKey }),
  });
}

export function useContentDrafts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: draftsKey,
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<ContentDraft[]> => {
      const client = getSupabaseClient();
      if (!client || !user?.id) return [];
      const { data, error } = await client
        .from("content_drafts")
        .select("id, topic, goal, caption, image_url, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data as ContentDraft[]) ?? [];
    },
  });
}

export function useSaveDraft() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: {
      id?: string;
      topic: string;
      goal: string;
      caption: string;
      image_url: string | null;
    }) => {
      const client = getSupabaseClient();
      if (!client || !user?.id) throw new Error("Not signed in.");
      const row = { ...draft, user_id: user.id };
      const { error } = await client.from("content_drafts").upsert(row);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: draftsKey }),
  });
}

export function useDeleteDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const client = getSupabaseClient();
      if (!client) throw new Error("Not signed in.");
      const { error } = await client.from("content_drafts").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: draftsKey }),
  });
}

// Month-to-date usage for the meter. Cheap count queries; the server is
// still the enforcement point.
export function useContentUsage() {
  const { user } = useAuth();
  return useQuery({
    queryKey: usageKey,
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const client = getSupabaseClient();
      if (!client || !user?.id) return { gensUsed: 0, premiumUsed: 0 };
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);
      const [gens, premium] = await Promise.all([
        client
          .from("ai_usage")
          .select("id", { count: "exact", head: true })
          .in("kind", ["generate", "regen_image"])
          .gte("created_at", monthStart.toISOString()),
        client
          .from("ai_usage")
          .select("id", { count: "exact", head: true })
          .eq("premium", true)
          .gte("created_at", monthStart.toISOString()),
      ]);
      return { gensUsed: gens.count ?? 0, premiumUsed: premium.count ?? 0 };
    },
  });
}

const friendlyErrors: Record<string, string> = {
  no_addon: "The Automated Content add-on isn't active on this account yet.",
  cap_reached: "You've used all of this month's generations. They reset on the 1st.",
  premium_cap_reached: "You've used all of this month's HD renders. They reset on the 1st.",
  profile_incomplete: "Finish your business profile first so posts sound like you.",
  not_authenticated: "Please sign in again.",
};

export function useGenerateContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      kind: GenerateKind;
      topic?: string;
      goal?: string;
      currentCaption?: string;
      tweak?: string;
      premium?: boolean;
    }): Promise<GenerateResult> => {
      const client = getSupabaseClient();
      if (!client) throw new Error("Not signed in.");
      const { data, error } = await client.functions.invoke("generate-content", {
        body: input,
      });
      if (error) {
        // Supabase wraps non-2xx responses; surface the function's error code.
        let code = "generation_failed";
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) code = ((await ctx.json()) as { error?: string }).error ?? code;
        } catch {
          // fall through to the generic message
        }
        throw new Error(friendlyErrors[code] ?? "Generation failed — please try again.");
      }
      const result = data as GenerateResult & { error?: string };
      if (result.error) {
        throw new Error(friendlyErrors[result.error] ?? "Generation failed — please try again.");
      }
      return result;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: usageKey }),
  });
}

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/notify";
import { api } from "@/lib/api";
import { reportSessionStatusProblems } from "@/lib/error-reporter";
import type { SessionAction } from "@/types";

export const queryKeys = {
  groups: ["groups"] as const,
  collections: ["collections"] as const,
  settings: ["settings"] as const,
  sessionStatus: ["session-status"] as const,
  scheduledPosts: ["scheduled-posts"] as const,
  scheduledSummary: ["scheduled-summary"] as const,
  history: ["history"] as const,
  extensionInfo: ["extension-info"] as const,
};

export function useGroups() {
  return useQuery({ queryKey: queryKeys.groups, queryFn: api.groups });
}

export function useCollections() {
  return useQuery({ queryKey: queryKeys.collections, queryFn: api.collections });
}

export function useSettings() {
  // retry: 1 so a dead local API surfaces an error in Settings within seconds
  // instead of the page sitting on "Loading settings…" through default retries.
  return useQuery({ queryKey: queryKeys.settings, queryFn: api.settings, retry: 1 });
}

export function useSessionStatus(options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.sessionStatus,
    queryFn: async () => {
      const status = await api.sessionStatus();
      reportSessionStatusProblems(status);
      return status;
    },
    refetchInterval: options.poll === false ? false : 2500,
  });
}

export function useScheduledPosts(options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.scheduledPosts,
    queryFn: api.scheduledPosts,
    refetchInterval: options.poll === false ? false : 5000,
  });
}

export function useScheduledSummary(options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.scheduledSummary,
    queryFn: api.scheduledSummary,
    refetchInterval: options.poll === false ? false : 5000,
  });
}

export function useHistory(options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.history,
    queryFn: api.history,
    refetchInterval: options.poll ? 5000 : false,
  });
}

export function useExtensionInfo() {
  return useQuery({ queryKey: queryKeys.extensionInfo, queryFn: api.extensionInfo, retry: 1 });
}

/** Derived category/subcategory/source lists from the loaded groups. */
export function useGroupTaxonomy() {
  const { data: groups = [] } = useGroups();
  const categories = useMemo(
    () => Array.from(new Set(groups.map((group) => group.category || "Uncategorized"))).sort(),
    [groups],
  );
  const subcategories = useMemo(
    () => Array.from(new Set(groups.map((group) => group.subcategory).filter(Boolean))).sort(),
    [groups],
  );
  const sources = useMemo(
    () => Array.from(new Set(groups.map((group) => group.source || "manual"))).sort(),
    [groups],
  );
  return { categories, subcategories, sources };
}

export function useInvalidate() {
  const queryClient = useQueryClient();
  return (...keys: (readonly string[])[]) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useSessionAction(sessionId: string | undefined) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      action,
      overrideBlockCooldown,
    }: {
      action: SessionAction;
      successMessage: string;
      overrideBlockCooldown?: boolean;
    }) => {
      if (!sessionId) return Promise.reject(new Error("No active session."));
      return api.sessionAction(sessionId, action, { overrideBlockCooldown });
    },
    onSuccess: async (_data, { successMessage }) => {
      await invalidate(
        queryKeys.sessionStatus,
        queryKeys.history,
        queryKeys.groups,
        queryKeys.settings,
      );
      toast.success(successMessage);
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useForceStop() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.forceStop(),
    onSuccess: async () => {
      await invalidate(queryKeys.sessionStatus, queryKeys.history, queryKeys.groups);
      toast.success("Runner reset. You can start a new queue now.");
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useCancelScheduledPost() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.cancelScheduledPost(id),
    onSuccess: async () => {
      await invalidate(queryKeys.scheduledPosts, queryKeys.scheduledSummary);
      toast.success("Scheduled post canceled.");
    },
    onError: (error) => toast.error(error.message),
  });
}

export function useCancelAllScheduledPosts() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.cancelAllScheduledPosts(),
    onSuccess: async (result) => {
      await invalidate(queryKeys.scheduledPosts, queryKeys.scheduledSummary);
      toast.success(
        `${result.canceled} scheduled post${result.canceled === 1 ? "" : "s"} canceled.`,
      );
    },
    onError: (error) => toast.error(error.message),
  });
}

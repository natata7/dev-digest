/* hooks/brief.ts — PR Brief: GET /pulls/:id/brief (stored, no LLM) and
   POST /pulls/:id/brief (generate/refresh, one LLM call). */
"use client";

import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { PrBrief } from "@devdigest/shared";

/** 404 (no_brief or PR not found) → null so the card shows "Generate brief". */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-brief", prId],
    queryFn: async () => {
      try {
        return await api.get<PrBrief>(`/pulls/${prId}/brief`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
    enabled: !!prId,
  });
}

/** On error the cached brief stays untouched (previous brief keeps showing). */
export function useGenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ["pr-brief-generate", prId],
    mutationFn: () => api.post<PrBrief>(`/pulls/${prId}/brief`),
    onSuccess: (data) => qc.setQueryData(["pr-brief", prId], data),
  });
}

/** True while any generate/refresh for this PR is in flight (shared across component instances). */
export function useBriefGenerating(prId: string | null | undefined) {
  return useIsMutating({ mutationKey: ["pr-brief-generate", prId] }) > 0;
}

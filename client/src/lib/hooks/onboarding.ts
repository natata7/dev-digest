/* hooks/onboarding.ts — stored tour GET + generate POST for the Onboarding tour page. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import type { Onboarding } from "@devdigest/shared";

/** 404 `no_tour` → `null` (empty state); every other error surfaces. */
export function useOnboardingTour(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["onboarding", repoId],
    queryFn: async () => {
      try {
        return await api.get<Onboarding>(`/repos/${repoId}/onboarding`);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404 && e.code === "no_tour") return null;
        throw e;
      }
    },
    enabled: !!repoId,
  });
}

export function useGenerateOnboardingTour(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Onboarding>(`/repos/${repoId}/onboarding`),
    onSuccess: (data) => qc.setQueryData(["onboarding", repoId], data),
  });
}

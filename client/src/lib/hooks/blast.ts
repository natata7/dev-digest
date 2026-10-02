/* hooks/blast.ts — React Query hooks over the Blast Radius routes:
     GET /pulls/:id/blast → BlastRadius (grouped downstream impact).
     GET /pulls/:id/history → PrHistory (prior merged PRs touching the same files).
   Mirrors the pattern in hooks/reviews.ts (usePrIntent) — no ad-hoc fetch in
   components; degraded/reason/indexed_sha pass through untouched. */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { BlastRadius, PrHistory } from "@devdigest/shared";

/** GET /pulls/:id/blast — the PR's blast radius (changed symbols → callers →
    endpoints/crons). `degraded`/`reason` on the response signal an
    incomplete index; the card renders those, it never hides them. */
export function useBlastRadius(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["blast", prId],
    queryFn: () => api.get<BlastRadius>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}

/** GET /pulls/:id/history — merged PRs that previously touched the same
    files ("Prior PRs"). `staleTime: Infinity` — merged history doesn't
    change within a session, no need to ever refetch on remount. */
export function usePrHistory(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-history", prId],
    queryFn: () => api.get<PrHistory>(`/pulls/${prId}/history`),
    enabled: !!prId,
    staleTime: Infinity,
  });
}

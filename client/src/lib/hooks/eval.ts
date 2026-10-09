/* hooks/eval.ts — React Query hooks for the eval pipeline (cases, runs, dashboards). */
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { EvalCaseFromFindingResult } from "@devdigest/shared";

/** One-click "Turn into eval case": accepted → must_find, dismissed → must_not_flag. */
export function useCreateEvalCaseFromFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      findingId,
      expectation,
    }: {
      findingId: string;
      expectation?: "must_find" | "must_not_flag";
    }) =>
      api.post<EvalCaseFromFindingResult>(
        `/findings/${findingId}/eval-case`,
        expectation ? { expectation } : undefined,
      ),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["eval-cases", res.case.owner_id] });
    },
  });
}

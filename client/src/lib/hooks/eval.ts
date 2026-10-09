/* hooks/eval.ts — React Query hooks for the eval pipeline (cases, runs, dashboards). */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  EvalAgentDashboard,
  EvalAgentRun,
  EvalCaseFromFindingResult,
  EvalCaseRecord,
  EvalCompare,
  EvalOverview,
} from "@devdigest/shared";

/** Body of a manual eval case (the server derives the expectation kind). */
export interface EvalCaseBody {
  name: string;
  input_diff: string;
  input_meta?: unknown;
  expected_output: unknown;
  notes?: string | null;
}

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

export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCaseRecord[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

export function useSaveEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, body }: { caseId?: string; body: EvalCaseBody }) =>
      caseId
        ? api.put<EvalCaseRecord>(`/eval-cases/${caseId}`, body)
        : api.post<EvalCaseRecord>(`/agents/${agentId}/eval-cases`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

export function useDeleteEvalCase(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<{ ok: true }>(`/eval-cases/${caseId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

/** Run the agent over all its cases (or just `caseIds`). */
export function useRunEvals(agentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseIds?: string[]) =>
      api.post<EvalAgentRun>(`/agents/${agentId}/eval-runs`, caseIds ? { case_ids: caseIds } : undefined),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-overview"] });
    },
  });
}

export function useAgentEvalDashboard(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-dashboard", agentId],
    queryFn: () => api.get<EvalAgentDashboard>(`/agents/${agentId}/eval-dashboard`),
    enabled: !!agentId,
  });
}

export function useEvalOverview() {
  return useQuery({
    queryKey: ["eval-overview"],
    queryFn: () => api.get<EvalOverview>("/eval/dashboard"),
  });
}

/** `a` = base run, `b` = candidate run. */
export function useEvalCompare(a: string | null, b: string | null) {
  return useQuery({
    queryKey: ["eval-compare", a, b],
    queryFn: () => api.get<EvalCompare>(`/eval-runs/compare?a=${a}&b=${b}`),
    enabled: !!a && !!b,
  });
}

/** "Run all agents": run every agent that has cases, one after another (each run is already parallel inside). */
export function useRunAllAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (agentIds: string[]) => {
      const done: EvalAgentRun[] = [];
      for (const id of agentIds) done.push(await api.post<EvalAgentRun>(`/agents/${id}/eval-runs`));
      return done;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["eval-overview"] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      qc.invalidateQueries({ queryKey: ["eval-cases"] });
    },
  });
}

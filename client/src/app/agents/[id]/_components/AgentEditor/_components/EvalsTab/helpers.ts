import type { EvalCaseRecord } from "@devdigest/shared";

export type CaseState = "passed" | "failed" | "error" | "never";

/** Status of a case's latest run for the list row. */
export function caseState(c: EvalCaseRecord): CaseState {
  if (!c.last_run) return "never";
  if (c.last_run.status === "error") return "error";
  return c.last_run.pass ? "passed" : "failed";
}

/** How many cases passed on their latest run. */
export function passingCount(cases: EvalCaseRecord[]): number {
  return cases.filter((c) => caseState(c) === "passed").length;
}

import type { PrBrief, Risk, ReviewRecord } from "@devdigest/shared";
import { SEVERITY_ORDER } from "./constants";

/** Stable high → medium → low sort (AC-15); model order kept within a level. */
export function sortRisks(risks: Risk[]): Risk[] {
  return risks
    .map((r, i) => ({ r, i }))
    .sort((a, b) => SEVERITY_ORDER[a.r.severity] - SEVERITY_ORDER[b.r.severity] || a.i - b.i)
    .map((x) => x.r);
}

export function isStale(brief: PrBrief, headSha: string | null | undefined): boolean {
  return !!headSha && brief.head_sha !== headSha;
}

/** Newest review that has a verdict (AC-20); null → plain summary. */
export function latestVerdictReview(reviews: ReviewRecord[] | undefined) {
  const done = (reviews ?? []).filter((r) => r.verdict != null);
  if (done.length === 0) return null;
  return done.reduce((a, b) => (b.created_at > a.created_at ? b : a));
}

export function reviewCounts(r: ReviewRecord) {
  return {
    findingsCount: r.findings.length,
    blockers: r.findings.filter((f) => f.severity === "CRITICAL").length,
  };
}

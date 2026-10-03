import { describe, it, expect } from "vitest";
import type { PrBrief, ReviewRecord, Risk } from "@devdigest/shared";
import { sortRisks, isStale, latestVerdictReview, reviewCounts } from "./helpers";

const risk = (title: string, severity: Risk["severity"]): Risk => ({
  kind: "k", title, explanation: "e", severity, file_refs: [],
});

const review = (id: string, created_at: string, verdict: ReviewRecord["verdict"]): ReviewRecord => ({
  id, pr_id: "p", agent_id: null, run_id: null, kind: "review", verdict, summary: null,
  score: null, model: null, created_at, findings: [],
});

describe("sortRisks", () => {
  it("orders high > medium > low and keeps model order within a level (stable)", () => {
    const input = [risk("l1", "low"), risk("m1", "medium"), risk("h1", "high"), risk("m2", "medium"), risk("h2", "high")];
    expect(sortRisks(input).map((r) => r.title)).toEqual(["h1", "h2", "m1", "m2", "l1"]);
  });
  it("does not mutate the input", () => {
    const input = [risk("l", "low"), risk("h", "high")];
    sortRisks(input);
    expect(input.map((r) => r.title)).toEqual(["l", "h"]);
  });
});

describe("isStale", () => {
  const brief = { head_sha: "aaa" } as PrBrief;
  it("is stale only when a known headSha differs", () => {
    expect(isStale(brief, "bbb")).toBe(true);
    expect(isStale(brief, "aaa")).toBe(false);
    expect(isStale(brief, null)).toBe(false);
    expect(isStale(brief, undefined)).toBe(false);
  });
});

describe("latestVerdictReview / reviewCounts", () => {
  it("returns null with no reviews or none with a verdict", () => {
    expect(latestVerdictReview(undefined)).toBeNull();
    expect(latestVerdictReview([review("a", "2026-01-01", null)])).toBeNull();
  });
  it("picks the newest review that has a verdict, ignoring newer verdict-less ones", () => {
    const r = latestVerdictReview([
      review("old", "2026-01-01", "approve"),
      review("new", "2026-02-01", "comment"),
      review("newest-null", "2026-03-01", null),
    ]);
    expect(r?.id).toBe("new");
  });
  it("counts findings and CRITICAL blockers", () => {
    const f = (severity: string) => ({ severity }) as ReviewRecord["findings"][number];
    const r = { ...review("a", "x", "approve"), findings: [f("CRITICAL"), f("WARNING"), f("CRITICAL")] };
    expect(reviewCounts(r)).toEqual({ findingsCount: 3, blockers: 2 });
  });
});

import { describe, it, expect } from "vitest";
import { isIndexReason, truncatedCategories } from "./helpers";

describe("isIndexReason (AC-29: Resync only for index-related reasons)", () => {
  it.each(["index_partial", "no_index", "index_degraded", "index_failed"] as const)(
    "%s offers Resync",
    (r) => expect(isIndexReason(r)).toBe(true),
  );
  it.each(["flag_off", "llm_failed", "llm_timeout", "llm_invalid_output", "llm_not_configured"] as const)(
    "%s does not",
    (r) => expect(isIndexReason(r)).toBe(false),
  );
  it("null does not", () => expect(isIndexReason(null)).toBe(false));
});

describe("truncatedCategories (AC-16)", () => {
  const c = (shown: number, total: number, truncated: boolean) => ({ shown, total, truncated });
  it("returns only truncated categories with shown/total", () => {
    const cov = {
      index_status: "full",
      files_indexed: 1,
      files_skipped: 0,
      routes: c(50, 80, true),
      scripts: c(3, 3, false),
      structure: c(40, 90, true),
      reading_path: c(12, 12, false),
      critical_paths: c(0, 0, false),
    } as never;
    expect(truncatedCategories(cov)).toEqual([
      { key: "routes", shown: 50, total: 80 },
      { key: "structure", shown: 40, total: 90 },
    ]);
  });
});

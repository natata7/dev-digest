import { describe, it, expect } from "vitest";
import { hasIndex, isIndexReason, isUnavailable, openHref, sectionAnchor, truncatedCategories } from "./helpers";

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

describe("sectionAnchor / isUnavailable / hasIndex (AC-51, AC-55, AC-49)", () => {
  it("anchors by kind", () => expect(sectionAnchor("local_run")).toBe("onb-local_run"));
  it("unavailable only for facts sections with the fixed prefix", () => {
    const sec = (source: string, body: string) => ({ source, body }) as never;
    expect(isUnavailable(sec("facts", "Unavailable — index none"))).toBe(true);
    expect(isUnavailable(sec("llm", "Unavailable — index none"))).toBe(false);
    expect(isUnavailable(sec("facts", "Real body"))).toBe(false);
  });
  it("hasIndex is false for zero files or status none", () => {
    expect(hasIndex({ files_indexed: 10, index_status: "full" } as never)).toBe(true);
    expect(hasIndex({ files_indexed: 0, index_status: "full" } as never)).toBe(false);
    expect(hasIndex({ files_indexed: 10, index_status: "none" } as never)).toBe(false);
  });
});

describe("openHref (AC-45, E24)", () => {
  it("builds the provider blob URL at the indexed sha", () => {
    expect(openHref({ provider: "github", full_name: "acme/api" }, "abc", "src/a b.ts")).toBe(
      "https://github.com/acme/api/blob/abc/src/a%20b.ts",
    );
  });
  it("is null without repo, full_name or sha", () => {
    expect(openHref(undefined, "abc", "a")).toBeNull();
    expect(openHref({ provider: "github", full_name: "" }, "abc", "a")).toBeNull();
    expect(openHref({ provider: "github", full_name: "a/b" }, null, "a")).toBeNull();
  });
});

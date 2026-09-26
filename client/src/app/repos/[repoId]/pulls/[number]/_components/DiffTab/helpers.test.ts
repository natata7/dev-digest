import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, SmartDiff } from "@devdigest/shared";
import { groupFiles, filesWithFindingsCount } from "./helpers";

function file(path: string): PrFile {
  return { path, additions: 1, deletions: 0, patch: "@@ -1 +1 @@\n+x" };
}

function finding(file: string): FindingRecord {
  return {
    id: `f-${file}`,
    severity: "WARNING",
    category: "bug",
    title: "t",
    file,
    start_line: 1,
    end_line: 1,
    rationale: "r",
    confidence: 0.5,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  };
}

const SMART_DIFF: SmartDiff = {
  groups: [
    { role: "core", files: [{ path: "src/a.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "tests", files: [{ path: "src/a.test.ts", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "wiring", files: [] },
    { role: "docs", files: [{ path: "README.md", additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "boilerplate", files: [] },
  ],
  split_suggestion: { too_big: false, total_lines: 3, proposed_splits: [] },
};

describe("groupFiles", () => {
  it("returns all 5 groups in ROLE_ORDER, resolving paths back to real PrFiles", () => {
    const files = [file("src/a.ts"), file("src/a.test.ts"), file("README.md")];
    const groups = groupFiles(SMART_DIFF, files);
    expect(groups.map((g) => g.role)).toEqual(["core", "tests", "wiring", "docs", "boilerplate"]);
    expect(groups.find((g) => g.role === "core")!.files).toEqual([files[0]]);
    expect(groups.find((g) => g.role === "wiring")!.files).toEqual([]);
  });

  it("skips a path the smart-diff response returned that isn't in `files`", () => {
    const files = [file("src/a.ts")]; // "src/a.test.ts" and "README.md" missing
    const groups = groupFiles(SMART_DIFF, files);
    expect(groups.find((g) => g.role === "tests")!.files).toEqual([]);
    expect(groups.find((g) => g.role === "core")!.files).toEqual(files);
  });

  it("returns an empty array when smartDiff is undefined", () => {
    expect(groupFiles(undefined, [file("a.ts")])).toEqual([]);
  });
});

describe("filesWithFindingsCount", () => {
  it("counts files (not findings) that have >=1 finding", () => {
    const files = [file("src/a.ts"), file("src/b.ts")];
    const findings = [finding("src/a.ts"), finding("src/a.ts"), finding("src/c.ts")];
    // src/a.ts has 2 findings but counts once; src/b.ts has none; src/c.ts isn't in `files`.
    expect(filesWithFindingsCount(files, findings)).toBe(1);
  });

  it("is 0 when there are no findings", () => {
    expect(filesWithFindingsCount([file("src/a.ts")], [])).toBe(0);
  });
});

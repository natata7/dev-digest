import { describe, it, expect } from "vitest";
import { lineDiff, hasChanges, collapseContext } from "./helpers";

describe("lineDiff", () => {
  it("marks an added line and keeps the rest as context", () => {
    const d = lineDiff("a\nb\nc", "a\nb\nNEW\nc");
    expect(d).toEqual([
      { kind: "same", text: "a" },
      { kind: "same", text: "b" },
      { kind: "add", text: "NEW" },
      { kind: "same", text: "c" },
    ]);
    expect(hasChanges(d)).toBe(true);
  });
  it("marks a replaced line as del + add", () => {
    const d = lineDiff("keep\nold", "keep\nnew");
    expect(d.filter((l) => l.kind !== "same")).toEqual([
      { kind: "del", text: "old" },
      { kind: "add", text: "new" },
    ]);
  });
  it("reports identical text as unchanged", () => {
    expect(hasChanges(lineDiff("x\ny", "x\ny"))).toBe(false);
  });
});

describe("collapseContext", () => {
  it("folds long unchanged stretches and keeps 2 lines around each change", () => {
    const old = Array.from({ length: 12 }, (_, i) => `l${i}`).join("\n");
    const next = old + "\nNEW";
    const shown = collapseContext(lineDiff(old, next), 2);
    expect(shown[0]).toEqual({ kind: "skip", count: 10 });
    expect(shown.slice(1).map((l) => (l.kind === "skip" ? "skip" : l.text))).toEqual(["l10", "l11", "NEW"]);
  });
  it("keeps a short diff untouched", () => {
    expect(collapseContext(lineDiff("a\nb", "a\nB"), 2)).toHaveLength(3);
  });
});

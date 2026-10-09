import { describe, it, expect } from "vitest";
import { lineDiff, hasChanges } from "./helpers";

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

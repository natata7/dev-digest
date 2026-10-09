import { describe, it, expect } from "vitest";
import type { EvalAgentRun } from "@devdigest/shared";
import { orderPair, series, toggleSelected, yRange } from "./helpers";

const run = (id: string, ran_at: string) => ({ id, ran_at }) as EvalAgentRun;

describe("AgentEvalView helpers", () => {
  it("keeps at most two selected runs, dropping the oldest pick", () => {
    expect(toggleSelected([], "a")).toEqual(["a"]);
    expect(toggleSelected(["a", "b"], "c")).toEqual(["b", "c"]);
    expect(toggleSelected(["a", "b"], "a")).toEqual(["b"]);
  });
  it("orders a pair older → newer and rejects anything but two known runs", () => {
    const runs = [run("new", "2026-05-29T09:00:00Z"), run("old", "2026-05-27T09:00:00Z")];
    expect(orderPair(runs, ["new", "old"])).toEqual(["old", "new"]);
    expect(orderPair(runs, ["new"])).toBeNull();
    expect(orderPair(runs, ["new", "ghost"])).toBeNull();
  });
  it("fills null metrics with the previous value", () => {
    const trend = [
      { ran_at: "1", recall: 0.5, precision: null, citation_accuracy: 1 },
      { ran_at: "2", recall: null, precision: 0.7, citation_accuracy: 1 },
    ];
    expect(series(trend, "recall")).toEqual([0.5, 0.5]);
    expect(series(trend, "precision")).toEqual([0, 0.7]);
  });
  it("picks a y window below the lowest value", () => {
    expect(yRange([0.82, 0.91]).yMin).toBe(0.7);
    expect(yRange([]).yMin).toBe(0);
  });
});

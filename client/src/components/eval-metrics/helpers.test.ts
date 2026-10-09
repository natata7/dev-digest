import { describe, it, expect } from "vitest";
import { pct, deltaPts, money, seconds } from "./helpers";

describe("eval-metrics helpers", () => {
  it("formats percentages and treats null as undefined, not 0%", () => {
    expect(pct(0.824)).toBe("82%");
    expect(pct(0)).toBe("0%");
    expect(pct(null)).toBe("—");
  });
  it("formats deltas in whole points with direction", () => {
    expect(deltaPts(0.04)).toEqual({ text: "▲ 4pt", tone: "up" });
    expect(deltaPts(-0.02)).toEqual({ text: "▼ 2pt", tone: "down" });
    expect(deltaPts(0.001)).toEqual({ text: "— 0pt", tone: "flat" });
    expect(deltaPts(null)).toBeNull();
  });
  it("formats cost and duration", () => {
    expect(money(0.2345)).toBe("$0.23");
    expect(money(null)).toBe("—");
    expect(seconds(1800)).toBe("1.8s");
  });
});

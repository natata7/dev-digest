import type { EvalAgentDashboard, EvalAgentRun } from "@devdigest/shared";

/** Toggle a run in the selection; at most two stay selected (the oldest pick is dropped). */
export function toggleSelected(sel: string[], id: string): string[] {
  if (sel.includes(id)) return sel.filter((x) => x !== id);
  return [...sel, id].slice(-2);
}

/** [older, newer] by `ran_at` for two selected run ids; null unless exactly two are known runs. */
export function orderPair(runs: EvalAgentRun[], ids: string[]): [string, string] | null {
  if (ids.length !== 2) return null;
  const picked = ids.map((id) => runs.find((r) => r.id === id));
  if (picked.some((r) => !r)) return null;
  const [x, y] = picked as EvalAgentRun[];
  return Date.parse(x!.ran_at) <= Date.parse(y!.ran_at) ? [x!.id, y!.id] : [y!.id, x!.id];
}

type Metric = "recall" | "precision" | "citation_accuracy";

/** Chart series: null (undefined metric) carries the previous value so the line has no hole. */
export function series(trend: EvalAgentDashboard["trend"], key: Metric): number[] {
  let last = 0;
  return trend.map((p) => (last = p[key] ?? last));
}

/** y-axis window: floor of the lowest value (to 0.1) minus headroom, capped at 1. */
export function yRange(all: number[]): { yMin: number; yMax: number } {
  if (all.length === 0) return { yMin: 0, yMax: 1 };
  const lo = Math.min(...all);
  return { yMin: Math.max(0, Math.floor((lo - 0.05) * 10) / 10), yMax: 1 };
}

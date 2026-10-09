/** Limits and tunables for the eval module. */

/** Context lines kept on each side of a finding's range in a case's diff fragment. */
export const FRAGMENT_CONTEXT_LINES = 20;
/** Max stored diff-fragment size (bytes of text). */
export const MAX_FRAGMENT_BYTES = 20 * 1024;
/** Max cases per agent. */
export const MAX_CASES_PER_AGENT = 200;
/** Per-case review timeout during a run. */
export const CASE_TIMEOUT_MS = 90_000;
/** How many runs the dashboard/trend returns. */
export const RUNS_LIMIT = 30;
/** How many runs the all-agents overview lists. */
export const RECENT_RUNS_LIMIT = 12;
/** Points in a per-agent sparkline. */
export const SPARK_POINTS = 8;

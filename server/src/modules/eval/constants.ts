/** Limits and tunables for the eval module. */

/** Context lines kept on each side of a finding's range in a case's diff fragment. */
export const FRAGMENT_CONTEXT_LINES = 20;
/** Max stored diff-fragment size (bytes of text). */
export const MAX_FRAGMENT_BYTES = 20 * 1024;
/** Max cases per agent. */
export const MAX_CASES_PER_AGENT = 200;
/** Per-attempt review timeout. Healthy cases finish in 10-20 s; a stalled provider request is abandoned and retried. */
export const CASE_TIMEOUT_MS = 60_000;
/** Attempts per case before it is recorded as an error. */
export const CASE_ATTEMPTS = 2;
/** How many runs the dashboard/trend returns. */
export const RUNS_LIMIT = 30;
/** How many runs the all-agents overview lists. */
export const RECENT_RUNS_LIMIT = 12;
/** Points in a per-agent sparkline. */
export const SPARK_POINTS = 8;
/** Cases reviewed in parallel during a run (higher values made the provider stall on some requests). */
export const CASE_CONCURRENCY = 2;

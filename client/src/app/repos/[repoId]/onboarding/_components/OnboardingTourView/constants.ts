import type { Onboarding } from "@devdigest/shared";

/** D11: reasons for which a Resync can help. */
export const INDEX_REASONS: ReadonlyArray<NonNullable<Onboarding["reason"]>> = [
  "index_partial",
  "no_index",
  "index_degraded",
  "index_failed",
];

export const SECTION_KINDS = [
  "architecture",
  "critical_paths",
  "local_run",
  "reading_order",
  "first_tasks",
] as const;

export const COVERAGE_KEYS = [
  "routes",
  "scripts",
  "structure",
  "reading_path",
  "critical_paths",
] as const;

/** D13: refetch once after a 409 generation_in_progress. */
export const IN_PROGRESS_REFETCH_MS = 3000;

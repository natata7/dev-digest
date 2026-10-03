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

/** D26: kept equal to the server skeleton text (`UNAVAILABLE_PREFIX` in the onboarding module). */
export const UNAVAILABLE_PREFIX = "Unavailable — index";

/** D30: how long the "Copied" confirmation stays. */
export const COPIED_MS = 2000;

export const SECTION_ICONS = {
  architecture: "Workflow",
  critical_paths: "Activity",
  local_run: "Command",
  reading_order: "FileText",
  first_tasks: "Target",
} as const;

/** Coverage categories whose "showing X of Y" note belongs in each card (AC-16). */
export const COVERAGE_BY_KIND = {
  architecture: ["routes", "structure"],
  critical_paths: ["critical_paths"],
  local_run: ["scripts"],
  reading_order: ["reading_path"],
  first_tasks: [],
} as const;

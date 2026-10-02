import type { IconName } from "@devdigest/ui";
import type { BlastDegradedReason } from "@devdigest/shared";

/** Icons for the summary row / tree nodes (design: `<>` for a changed symbol,
 *  globe for endpoints, clock for crons, corner-arrow for a caller row). */
export const SYMBOL_ICON: IconName = "Code";
export const CALLERS_ICON: IconName = "Users";
export const ENDPOINT_ICON: IconName = "Globe";
export const CRON_ICON: IconName = "Clock";
export const CALLER_ROW_ICON: IconName = "CornerDownRight";
export const PRIOR_PRS_ICON: IconName = "History";

/** Endpoint pills are blue, cron pills are amber — deliberately distinct
 *  (Design Considerations, spec Unit 2). */
export const ENDPOINT_PILL = { color: "var(--accent-text)", bg: "var(--accent-bg)" };
export const CRON_PILL = { color: "var(--warn)", bg: "var(--warn-bg)" };

/** Every `BlastDegradedReason` needs a `degraded.reason.<key>` translation —
 *  this Record forces a compile error if a new reason is added without one. */
export const DEGRADED_REASON_KEY: Record<BlastDegradedReason, BlastDegradedReason> = {
  flag_off: "flag_off",
  index_failed: "index_failed",
  index_partial: "index_partial",
  repo_too_large: "repo_too_large",
  no_data: "no_data",
};

// ---- Graph view (BlastGraph) ----

/** Fixed-layout constants for the inline-SVG graph — column width is derived
 *  at render time from the (fluid) viewBox, everything else is fixed so row
 *  spacing stays predictable regardless of node count. */
export const GRAPH_VIEWBOX_WIDTH = 720;
export const GRAPH_ROW_HEIGHT = 40;
export const GRAPH_TOP_PADDING = 24;
export const GRAPH_NODE_WIDTH = 168;
export const GRAPH_NODE_HEIGHT = 26;
export const GRAPH_MAX_LABEL_CHARS = 20;

/** "Changed symbol" and "endpoint" nodes share the accent-blue outline per
 *  the reference design; crons are amber (same tone as the Tree cron pill);
 *  callers stay neutral. */
export const GRAPH_ACCENT = { color: "var(--accent-text)", bg: "var(--accent-bg)" };
export const GRAPH_NEUTRAL = { color: "var(--text-primary)", bg: "var(--bg-hover)" };

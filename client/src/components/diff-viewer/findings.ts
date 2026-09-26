/* Inline-finding support for the DiffViewer (Files changed tab, Smart Diff).
   Pure helpers + the API shape the viewer needs. Mirrors comments.ts's shape.
   Shared code — knows only `FindingRecord` (a @devdigest/shared type) and
   line keys; NEVER imports a feature-level component like FindingCard. The
   caller supplies `render` so it stays presentation-agnostic. */
import type { ReactNode } from "react";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { lineKey } from "./comments";

/** Rank for picking the most severe finding when several share a line. */
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

/** Row-label wording for the flagged line's severity stripe — distinct from
 *  SeverityBadge's own "Critical"/"Warning"/"Suggestion" wording used on the
 *  finding card itself. */
const ROW_LABEL: Record<Severity, string> = {
  CRITICAL: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion",
};

/** The most severe finding among several anchored to the same code line —
 *  that's the one whose color/label marks the line. */
export function topSeverityFinding(findings: FindingRecord[]): FindingRecord | undefined {
  if (findings.length === 0) return undefined;
  return findings.reduce((top, f) =>
    (SEVERITY_RANK[f.severity] ?? 0) > (SEVERITY_RANK[top.severity] ?? 0) ? f : top,
  );
}

export function rowSeverityLabel(severity: Severity): string {
  return ROW_LABEL[severity] ?? severity.toLowerCase();
}

/** What the viewer needs to read + render findings anchored to diff lines. */
export interface DiffFindingApi {
  findings: FindingRecord[];
  show: boolean;
  render: (finding: FindingRecord) => ReactNode;
}

/**
 * Split findings into those anchored to a rendered line (keyed `RIGHT:${line}`,
 * matching keysForLine's RIGHT/new-side key) vs. "unanchored" ones whose line
 * isn't present in this patch — surfaced separately so nothing is silently
 * dropped. Same shape as partitionThreads.
 */
export function partitionFindings(
  findings: FindingRecord[],
  renderedKeys: Set<string>,
): { matched: Map<string, FindingRecord[]>; unanchored: FindingRecord[] } {
  const matched = new Map<string, FindingRecord[]>();
  const unanchored: FindingRecord[] = [];
  for (const f of findings) {
    const key = lineKey("RIGHT", f.start_line);
    if (key && renderedKeys.has(key)) {
      const list = matched.get(key) ?? [];
      list.push(f);
      matched.set(key, list);
    } else {
      unanchored.push(f);
    }
  }
  return { matched, unanchored };
}

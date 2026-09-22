/* Inline-finding support for the DiffViewer (Files changed tab, Smart Diff).
   Pure helpers + the API shape the viewer needs. Mirrors comments.ts's shape.
   Shared code — knows only `FindingRecord` (a @devdigest/shared type) and
   line keys; NEVER imports a feature-level component like FindingCard. The
   caller supplies `render` so it stays presentation-agnostic. */
import type { ReactNode } from "react";
import type { FindingRecord } from "@devdigest/shared";
import { lineKey } from "./comments";

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

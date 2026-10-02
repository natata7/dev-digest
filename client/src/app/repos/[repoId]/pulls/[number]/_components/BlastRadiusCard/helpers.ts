/* Pure helpers for BlastRadiusCard — no React, no fetch. Keeps the summary
   counts and caller-link building unit-testable in isolation. Never re-caps
   or slices `callers`: the per-symbol limit lives server-side
   (repo-intel/constants.ts) and this module must not duplicate it. */
import type { BlastRadius, RepoProvider } from "@devdigest/shared";
import { repoBlobUrl } from "@/lib/repo-urls";

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Summary-row counts: unique changed-symbol names, total callers across all
 *  downstream groups (no dedup — the same caller can legitimately call two
 *  different changed symbols), and the unique union of endpoints/crons
 *  across groups (a shared handler can appear under more than one symbol). */
export function computeCounts(blast: BlastRadius): BlastCounts {
  return {
    symbols: new Set(blast.changed_symbols.map((s) => s.name)).size,
    callers: blast.downstream.reduce((sum, group) => sum + group.callers.length, 0),
    endpoints: new Set(blast.downstream.flatMap((group) => group.endpoints_affected)).size,
    crons: new Set(blast.downstream.flatMap((group) => group.crons_affected)).size,
  };
}

/** Caller `file:line` deep-link, pinned to the index's commit so line numbers
 *  match what the index recorded. Falls back to the PR head sha only when
 *  the route didn't return one (e.g. index not yet built). */
export function callerUrl(
  provider: RepoProvider,
  repoFullName: string,
  indexedSha: string | null | undefined,
  headSha: string | null | undefined,
  file: string,
  line: number,
): string {
  const sha = indexedSha ?? headSha ?? "HEAD";
  return repoBlobUrl(provider, repoFullName, sha, file, line);
}

// ---- Graph view (task 4.1) ----

export interface GraphNode {
  id: string;
  label: string;
  column: "symbol" | "caller" | "impact";
  kind?: "endpoint" | "cron";
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface BlastGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** BlastRadius -> graph nodes/edges for the Graph view. Three columns:
 *  changed symbol -> caller -> endpoint/cron. The contract has no per-caller
 *  facts, so every caller of a group links to that same group's
 *  endpoints/crons (a group-level fact, not a per-caller one).
 *
 *  Caller nodes are keyed by `name+file` (not name alone) — two different
 *  files can each declare a same-named caller, and merging them would draw a
 *  false edge from a symbol to a caller that never actually calls it.
 *
 *  ponytail: groups with zero callers get no symbol node — an isolated node
 *  with no edges is noise, and the Tree view already shows "no callers" for
 *  that symbol. Revisit if a design review wants them anyway. */
export function toGraph(blast: BlastRadius): BlastGraphData {
  const nodes = new Map<string, GraphNode>();
  const edgeKeys = new Set<string>();
  const edges: GraphEdge[] = [];

  const addNode = (node: GraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };
  const addEdge = (from: string, to: string) => {
    const key = `${from}->${to}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({ from, to });
  };

  for (const group of blast.downstream) {
    if (group.callers.length === 0) continue;

    const symbolId = `symbol:${group.symbol}`;
    addNode({ id: symbolId, label: group.symbol, column: "symbol" });

    for (const caller of group.callers) {
      const callerId = `caller:${caller.name}:${caller.file}`;
      addNode({ id: callerId, label: caller.name, column: "caller" });
      addEdge(symbolId, callerId);

      for (const endpoint of group.endpoints_affected) {
        const impactId = `impact:endpoint:${endpoint}`;
        addNode({ id: impactId, label: endpoint, column: "impact", kind: "endpoint" });
        addEdge(callerId, impactId);
      }
      for (const cron of group.crons_affected) {
        const impactId = `impact:cron:${cron}`;
        addNode({ id: impactId, label: cron, column: "impact", kind: "cron" });
        addEdge(callerId, impactId);
      }
    }
  }

  return { nodes: [...nodes.values()], edges };
}

import type {
  BlastRadius,
  ChangedSymbol,
  DownstreamImpact,
  PriorPr,
  PrHistoryItem,
} from '@devdigest/shared';
import type { BlastCallerRow, BlastResult } from '../repo-intel/types.js';

/**
 * Pure mapper: flat facade `BlastResult` (callers keyed by `viaSymbol`) →
 * grouped `BlastRadius` contract (`downstream[]`, one entry per changed
 * symbol name). No re-capping/filtering here — the caller fan-out cap and
 * BFS depth are the facade's limits, defined once in repo-intel; every
 * caller row the facade returns is passed through into exactly one group.
 */
export function toBlastRadius(result: BlastResult, indexedSha?: string): BlastRadius {
  const changed_symbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));
  const downstream = buildDownstream(result);

  const blast: BlastRadius = {
    changed_symbols,
    downstream,
    summary: '',
    ...(result.degraded !== undefined ? { degraded: result.degraded } : {}),
    ...(result.reason ? { reason: result.reason } : {}),
    ...(indexedSha ? { indexed_sha: indexedSha } : {}),
  };
  // Degraded fallback: no per-caller-file facts, so per-group endpoints are
  // always empty — use the flat impactedEndpoints count instead of 0.
  blast.summary = buildSummary(
    blast,
    result.factsByFile ? undefined : result.impactedEndpoints.length,
  );
  return blast;
}

/**
 * Deterministic count string: `"<n> symbols · <n> callers · <n> endpoints ·
 * <n> crons"`. `fallbackEndpointsCount`, when given, overrides the
 * union-of-per-group-endpoints count (degraded/no-`factsByFile` path).
 */
export function buildSummary(blast: BlastRadius, fallbackEndpointsCount?: number): string {
  const symbols = blast.changed_symbols.length;
  const callers = blast.downstream.reduce((sum, d) => sum + d.callers.length, 0);
  const endpoints =
    fallbackEndpointsCount !== undefined
      ? fallbackEndpointsCount
      : new Set(blast.downstream.flatMap((d) => d.endpoints_affected)).size;
  const crons = new Set(blast.downstream.flatMap((d) => d.crons_affected)).size;
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  return [n(symbols, 'symbol'), n(callers, 'caller'), n(endpoints, 'endpoint'), n(crons, 'cron')].join(' · ');
}

/** Highest `rank` among a group's callers; `-Infinity` for a zero-caller
 *  group so it always sorts after any group with at least one caller. */
function maxRank(rows: BlastCallerRow[] | undefined): number {
  if (!rows || rows.length === 0) return -Infinity;
  return Math.max(...rows.map((r) => r.rank));
}

function buildDownstream(result: BlastResult): DownstreamImpact[] {
  // Group key = changed-symbol NAME (the contract's DownstreamImpact carries
  // no file — two declarations of the same name across files merge into one
  // group). Union in every caller's viaSymbol too, so a caller row is never
  // silently dropped even if the facade ever returns one outside the
  // declared changedSymbols set.
  const symbolNames = new Set<string>();
  for (const s of result.changedSymbols) symbolNames.add(s.name);
  for (const c of result.callers) symbolNames.add(c.viaSymbol);

  const callersByViaSymbol = new Map<string, BlastCallerRow[]>();
  for (const c of result.callers) {
    const list = callersByViaSymbol.get(c.viaSymbol) ?? [];
    list.push(c);
    callersByViaSymbol.set(c.viaSymbol, list);
  }

  const groups: DownstreamImpact[] = [...symbolNames].map((name) => {
    const rows = [...(callersByViaSymbol.get(name) ?? [])].sort(
      (a, b) => b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line,
    );
    const callerFiles = new Set(rows.map((r) => r.file));
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    if (result.factsByFile) {
      for (const file of callerFiles) {
        const facts = result.factsByFile[file];
        if (!facts) continue;
        for (const e of facts.endpoints) endpoints.add(e);
        for (const c of facts.crons) crons.add(c);
      }
    }
    return {
      symbol: name,
      callers: rows.map((r) => ({ name: r.symbol, file: r.file, line: r.line })),
      endpoints_affected: [...endpoints].sort(),
      crons_affected: [...crons].sort(),
    };
  });

  return groups.sort((a, b) => {
    const rankA = maxRank(callersByViaSymbol.get(a.symbol));
    const rankB = maxRank(callersByViaSymbol.get(b.symbol));
    if (rankA !== rankB) return rankB - rankA;
    return a.symbol.localeCompare(b.symbol);
  });
}

/**
 * Pure mapper: adapter `PriorPr[]` (a wider candidate set, in discovery
 * order) → the `PrHistory` contract's `history[]` — sorted by files-overlap
 * count desc, then `merged_at` desc, then sliced to `limit`. `notes` is deterministic:
 * `"touched <n> of these files"`.
 */
export function toPriorHistory(prior: PriorPr[], limit: number): PrHistoryItem[] {
  return [...prior]
    .sort(
      (a, b) =>
        b.files.length - a.files.length || Date.parse(b.merged_at) - Date.parse(a.merged_at),
    )
    .slice(0, limit)
    .map((p) => ({
      pr_number: p.number,
      title: p.title,
      merged_at: p.merged_at,
      author: p.author,
      files_overlap: p.files,
      notes: `touched ${p.files.length} of these files`,
    }));
}

import { describe, it, expect } from 'vitest';
import { BlastRadius, PrHistory } from '@devdigest/shared';
import type { PriorPr } from '@devdigest/shared';
import type { BlastCallerRow, BlastResult } from '../repo-intel/types.js';
import { toBlastRadius, buildSummary, toPriorHistory } from './helpers.js';

/**
 * Pure mapper tests. Contract is `@devdigest/shared`'s `BlastRadius`
 * (`downstream[]` grouped by changed-symbol NAME); the facade's flat
 * `BlastResult` (`callers[]` keyed by `viaSymbol`) is the input shape —
 * see `repo-intel/types.ts`.
 */

function caller(overrides: Partial<BlastCallerRow> = {}): BlastCallerRow {
  return {
    file: 'src/caller.ts',
    symbol: 'callerFn',
    viaSymbol: 'foo',
    line: 1,
    rank: 0,
    ...overrides,
  };
}

function baseResult(overrides: Partial<BlastResult> = {}): BlastResult {
  return {
    changedSymbols: [],
    callers: [],
    impactedEndpoints: [],
    ...overrides,
  };
}

describe('toBlastRadius', () => {
  it('groups callers by viaSymbol, unions+dedupes facts across caller files, merges same-name symbols declared in two files, and sorts groups/callers by rank', () => {
    const result: BlastResult = baseResult({
      changedSymbols: [
        { file: 'src/a.ts', name: 'foo', kind: 'function' },
        { file: 'src/b.ts', name: 'foo', kind: 'function' }, // same name, 2nd file
        { file: 'src/c.ts', name: 'bar', kind: 'function' }, // zero callers
      ],
      callers: [
        caller({ file: 'src/caller1.ts', symbol: 'callerA', viaSymbol: 'foo', line: 10, rank: 5 }),
        caller({ file: 'src/caller2.ts', symbol: 'callerB', viaSymbol: 'foo', line: 3, rank: 5 }),
        caller({ file: 'src/caller3.ts', symbol: 'callerC', viaSymbol: 'foo', line: 1, rank: 9 }),
      ],
      impactedEndpoints: ['GET /a', 'POST /b'],
      factsByFile: {
        'src/caller1.ts': { endpoints: ['GET /a'], crons: [] },
        'src/caller2.ts': { endpoints: ['GET /a', 'POST /b'], crons: ['nightly'] },
        'src/caller3.ts': { endpoints: [], crons: ['nightly'] },
      },
    });

    const blast = toBlastRadius(result);

    // One group per changed-symbol NAME — 'foo' declared in a.ts AND b.ts merges into one.
    expect(blast.downstream).toHaveLength(2);

    // Group order: max-caller-rank desc → 'foo' (rank 9) before 'bar' (zero callers).
    expect(blast.downstream.map((d) => d.symbol)).toEqual(['foo', 'bar']);

    const foo = blast.downstream[0]!;
    // Caller order: rank desc, then file asc, then line asc.
    // rank 9 (caller3) first; then the rank-5 tie broken by file (caller1.ts < caller2.ts).
    expect(foo.callers.map((c) => c.name)).toEqual(['callerC', 'callerA', 'callerB']);

    // Facts union+dedupe across the group's caller files, sorted.
    expect(foo.endpoints_affected).toEqual(['GET /a', 'POST /b']);
    expect(foo.crons_affected).toEqual(['nightly']);

    // Zero-caller symbol still produces a group, with empty arrays.
    const bar = blast.downstream[1]!;
    expect(bar.callers).toEqual([]);
    expect(bar.endpoints_affected).toEqual([]);
    expect(bar.crons_affected).toEqual([]);
  });

  it('is a pure pass-through of every caller row for one symbol — no re-capping/filtering (25 in → 25 out)', () => {
    const callers: BlastCallerRow[] = Array.from({ length: 25 }, (_, i) =>
      caller({ file: `src/caller${i}.ts`, symbol: `caller${i}`, viaSymbol: 'foo', line: i + 1, rank: 25 - i }),
    );
    const result = baseResult({
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers,
    });

    const blast = toBlastRadius(result);

    expect(blast.downstream).toHaveLength(1);
    expect(blast.downstream[0]!.callers).toHaveLength(25);
  });

  it('passes degraded/reason straight through from the facade result', () => {
    const result = baseResult({ degraded: true, reason: 'index_partial' });
    const blast = toBlastRadius(result);
    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('index_partial');
  });

  it('leaves degraded/reason unset when the facade result does not set them', () => {
    const blast = toBlastRadius(baseResult());
    expect(blast.degraded).toBeUndefined();
    expect(blast.reason).toBeUndefined();
  });

  it('missing factsByFile: per-group endpoints/crons are empty and the summary falls back to impactedEndpoints.length', () => {
    const result = baseResult({
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [caller({ viaSymbol: 'foo' })],
      impactedEndpoints: ['GET /x', 'GET /y'],
      // factsByFile intentionally absent (degraded/ripgrep path).
    });

    const blast = toBlastRadius(result);

    expect(blast.downstream[0]!.endpoints_affected).toEqual([]);
    expect(blast.downstream[0]!.crons_affected).toEqual([]);
    expect(blast.summary).toBe('1 symbol · 1 caller · 2 endpoints · 0 crons');
  });

  it('sets indexed_sha only when given a non-empty sha', () => {
    const result = baseResult();
    expect(toBlastRadius(result).indexed_sha).toBeUndefined();
    expect(toBlastRadius(result, '').indexed_sha).toBeUndefined();
    expect(toBlastRadius(result, 'abc123').indexed_sha).toBe('abc123');
  });

  it('output parses against the BlastRadius contract', () => {
    const result = baseResult({
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [caller({ viaSymbol: 'foo' })],
      impactedEndpoints: ['GET /x'],
      factsByFile: { 'src/caller.ts': { endpoints: ['GET /x'], crons: [] } },
      degraded: false,
    });

    const blast = toBlastRadius(result, 'sha1');

    expect(() => BlastRadius.parse(blast)).not.toThrow();
  });
});

describe('buildSummary', () => {
  it('formats "<n> symbols · <n> callers · <n> endpoints · <n> crons" from unique union counts', () => {
    const blast: BlastRadius = {
      changed_symbols: [
        { name: 'foo', file: 'a.ts', kind: 'function' },
        { name: 'bar', file: 'b.ts', kind: 'function' },
      ],
      downstream: [
        {
          symbol: 'foo',
          callers: [
            { name: 'c1', file: 'x.ts', line: 1 },
            { name: 'c2', file: 'y.ts', line: 2 },
          ],
          endpoints_affected: ['GET /a'],
          crons_affected: ['nightly'],
        },
        {
          symbol: 'bar',
          callers: [{ name: 'c3', file: 'z.ts', line: 3 }],
          // Same endpoint/cron as the other group — union must dedupe.
          endpoints_affected: ['GET /a', 'POST /b'],
          crons_affected: ['nightly'],
        },
      ],
      summary: '',
    };

    expect(buildSummary(blast)).toBe('2 symbols · 3 callers · 2 endpoints · 1 cron');
  });

  it('uses fallbackEndpointsCount when given, overriding the union count', () => {
    const blast: BlastRadius = {
      changed_symbols: [{ name: 'foo', file: 'a.ts', kind: 'function' }],
      downstream: [{ symbol: 'foo', callers: [], endpoints_affected: [], crons_affected: [] }],
      summary: '',
    };

    expect(buildSummary(blast, 5)).toBe('1 symbol · 0 callers · 5 endpoints · 0 crons');
  });
});

function priorPr(overrides: Partial<PriorPr> = {}): PriorPr {
  return {
    number: 1,
    title: 'A PR',
    author: 'marisa',
    merged_at: '2026-01-01T00:00:00Z',
    files: ['src/a.ts'],
    ...overrides,
  };
}

describe('toPriorHistory', () => {
  it('sorts by files-overlap count desc, then merged_at desc', () => {
    const prior: PriorPr[] = [
      priorPr({ number: 1, files: ['src/a.ts'], merged_at: '2026-01-01T00:00:00Z' }),
      priorPr({ number: 2, files: ['src/a.ts', 'src/b.ts'], merged_at: '2026-01-02T00:00:00Z' }),
      // Same overlap count as #2 but merged later — should come first among ties.
      priorPr({ number: 3, files: ['src/a.ts', 'src/c.ts'], merged_at: '2026-01-05T00:00:00Z' }),
    ];

    const history = toPriorHistory(prior, 5);

    expect(history.map((h) => h.pr_number)).toEqual([3, 2, 1]);
  });

  it('slices to the given limit after sorting', () => {
    const prior: PriorPr[] = [
      priorPr({ number: 1, files: ['a.ts'] }),
      priorPr({ number: 2, files: ['a.ts', 'b.ts'] }),
      priorPr({ number: 3, files: ['a.ts', 'b.ts', 'c.ts'] }),
    ];

    const history = toPriorHistory(prior, 2);

    expect(history).toHaveLength(2);
    expect(history.map((h) => h.pr_number)).toEqual([3, 2]);
  });

  it('builds a deterministic "touched <n> of these files" note from the overlap count', () => {
    const [item] = toPriorHistory([priorPr({ files: ['src/a.ts', 'src/b.ts', 'src/c.ts'] })], 5);
    expect(item!.notes).toBe('touched 3 of these files');
  });

  it('maps fields 1:1 into PrHistoryItem shape', () => {
    const [item] = toPriorHistory(
      [priorPr({ number: 9, title: 'Rate limit fix', author: 'bob', merged_at: '2026-02-01T00:00:00Z', files: ['x.ts'] })],
      5,
    );
    expect(item).toEqual({
      pr_number: 9,
      title: 'Rate limit fix',
      merged_at: '2026-02-01T00:00:00Z',
      author: 'bob',
      files_overlap: ['x.ts'],
      notes: 'touched 1 of these files',
    });
  });

  it('output parses against the PrHistory contract', () => {
    const history = toPriorHistory([priorPr(), priorPr({ number: 2 })], 5);
    expect(() => PrHistory.parse({ history })).not.toThrow();
  });

  it('empty input → empty history', () => {
    expect(toPriorHistory([], 5)).toEqual([]);
  });
});

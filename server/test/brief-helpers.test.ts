import { describe, it, expect } from 'vitest';
import type { BlastRadius, PrBriefDraft, Risk } from '@devdigest/shared';
import {
  blastUsable,
  buildAllowlist,
  buildFactsMessage,
  groundDraft,
  hunkRanges,
  missingInputs,
  orderSpecPaths,
  snapLine,
  toDiffFacts,
  type DiffFileFact,
} from '../src/modules/brief/helpers.js';

const blast = (over: Partial<BlastRadius> = {}): BlastRadius => ({
  changed_symbols: [{ name: 'foo', file: 'src/sym.ts', kind: 'function' }],
  downstream: [{ symbol: 'foo', callers: [{ name: 'bar', file: 'src/caller.ts', line: 40 }], endpoints_affected: [], crons_affected: [] }],
  summary: '1 symbol · 1 caller',
  ...over,
});
const fact = (path: string, ranges: [number, number][] = [], add = 1, del = 0): DiffFileFact => ({
  path, additions: add, deletions: del, role: 'core', ranges,
});
const risk = (title: string, refs: string[]): Risk => ({ kind: 'k', title, explanation: 'e', severity: 'high', file_refs: refs });

describe('hunkRanges (AC-14, AC-27)', () => {
  it('parses new-side inclusive ranges, default count 1, skips pure deletions, null -> []', () => {
    const patch = ['@@ -1,2 +10,3 @@ function foo()', '+a', '@@ -20 +30 @@', '+b', '@@ -40,2 +0,0 @@', '-gone'].join('\n');
    expect(hunkRanges(patch)).toEqual([[10, 12], [30, 30]]);
    expect(hunkRanges(null)).toEqual([]);
    expect(hunkRanges('')).toEqual([]);
  });
});

describe('buildAllowlist (AC-11)', () => {
  const diff = [fact('src/a.ts', [[1, 5]])];
  it('is diff ∪ changed-symbol files ∪ caller files, exact string match only', () => {
    const { paths } = buildAllowlist(diff, blast());
    expect([...paths].sort()).toEqual(['src/a.ts', 'src/caller.ts', 'src/sym.ts']);
    expect(paths.has('./src/a.ts')).toBe(false);
    expect(paths.has('SRC/a.ts')).toBe(false);
  });
  it('caller-only files anchor on caller lines; diff files anchor on hunks only', () => {
    const b = blast({
      downstream: [{ symbol: 'foo', callers: [{ name: 'x', file: 'src/a.ts', line: 99 }, { name: 'y', file: 'src/caller.ts', line: 7 }], endpoints_affected: [], crons_affected: [] }],
    });
    const { anchors } = buildAllowlist(diff, b);
    expect(anchors.get('src/a.ts')).toEqual([[1, 5]]);
    expect(anchors.get('src/caller.ts')).toEqual([[7, 7]]);
    expect(anchors.has('src/sym.ts')).toBe(false);
  });
  it('null blast -> diff paths only', () => {
    expect([...buildAllowlist(diff, null).paths]).toEqual(['src/a.ts']);
  });
});

describe('snapLine (AC-14)', () => {
  it('keeps valid lines, snaps to nearest range edge (ties -> lower), none -> 1', () => {
    expect(snapLine(12, [[10, 20]])).toBe(12);
    expect(snapLine(5, [[10, 20]])).toBe(10);
    expect(snapLine(99, [[10, 20]])).toBe(20);
    expect(snapLine(15, [[10, 12], [18, 20]])).toBe(12); // dist 3 vs 3 -> lower
    expect(snapLine(7, [[10, 12], [100, 120]])).toBe(10);
    expect(snapLine(7, undefined)).toBe(1);
    expect(snapLine(7, [])).toBe(1);
  });
});

describe('groundDraft (AC-12, AC-13, AC-15, A10)', () => {
  const allow = buildAllowlist([fact('src/a.ts', [[10, 20]])], null);
  it('drops invented refs, drops risks left without refs, counts, snaps and drops focus', () => {
    const draft: PrBriefDraft = {
      summary: '  hi  ',
      risks: [risk('keep', ['src/a.ts', 'src/ghost.ts']), risk('gone', ['src/ghost.ts'])],
      review_focus: [
        { file: 'src/a.ts', line: 15, reason: 'ok' },
        { file: 'src/a.ts', line: 500, reason: 'snap' },
        { file: 'src/ghost.ts', line: 1, reason: 'drop' },
      ],
    };
    const out = groundDraft(draft, allow);
    expect(out.summary).toBe('hi');
    expect(out.risks.map((r) => [r.title, r.file_refs])).toEqual([['keep', ['src/a.ts']]]);
    expect(out.review_focus.map((f) => f.line)).toEqual([15, 20]);
    expect(out.dropped).toEqual({ risks: 1, fileRefs: 2, focus: 1, snapped: 1 });
  });
  it('cap 8 applies AFTER filtering, model order kept', () => {
    const risks = [
      ...Array.from({ length: 3 }, (_, i) => risk(`bad${i}`, ['nope.ts'])),
      ...Array.from({ length: 10 }, (_, i) => risk(`ok${i}`, ['src/a.ts'])),
    ];
    const focus = [
      { file: 'nope.ts', line: 1, reason: 'x' },
      ...Array.from({ length: 10 }, (_, i) => ({ file: 'src/a.ts', line: 10 + i, reason: `r${i}` })),
    ];
    const out = groundDraft({ summary: 's', risks, review_focus: focus }, allow);
    expect(out.risks.map((r) => r.title)).toEqual(Array.from({ length: 8 }, (_, i) => `ok${i}`));
    expect(out.review_focus.map((f) => f.reason)).toEqual(Array.from({ length: 8 }, (_, i) => `r${i}`));
  });
  it('deleted file / null patch (no anchors) -> line 1', () => {
    const a = buildAllowlist([fact('gone.ts', [])], null);
    const out = groundDraft({ summary: 's', risks: [], review_focus: [{ file: 'gone.ts', line: 33, reason: 'r' }] }, a);
    expect(out.review_focus[0]!.line).toBe(1);
  });
});

describe('orderSpecPaths (D1)', () => {
  it('usage count DESC then path ASC, dedupes within an agent', () => {
    expect(orderSpecPaths([['b.md', 'a.md', 'a.md'], ['c.md', 'b.md'], ['c.md', 'b.md']])).toEqual(['b.md', 'c.md', 'a.md']);
    expect(orderSpecPaths([])).toEqual([]);
  });
});

describe('missingInputs / blastUsable (AC-4, AC-34)', () => {
  it('reports each missing input', () => {
    expect(missingInputs({ intent: {}, blast: {}, specDocs: 1, description: 'x' })).toEqual([]);
    expect(missingInputs({ intent: null, blast: null, specDocs: 0, description: '  ' })).toEqual(['intent', 'blast', 'specs', 'description']);
    expect(missingInputs({ intent: {}, blast: {}, specDocs: 1, description: null })).toEqual(['description']);
  });
  it('only index_partial degraded reads are usable (flagged partial)', () => {
    expect(blastUsable(blast())).toEqual({ use: true, partial: false });
    expect(blastUsable(blast({ degraded: true, reason: 'index_partial' }))).toEqual({ use: true, partial: true });
    for (const reason of ['flag_off', 'index_failed', 'repo_too_large', 'no_data'] as const) {
      expect(blastUsable(blast({ degraded: true, reason }))).toEqual({ use: false, partial: false });
    }
    expect(blastUsable(blast({ degraded: true }))).toEqual({ use: false, partial: false });
  });
});

describe('buildFactsMessage (AC-4, AC-26, AC-27)', () => {
  const base = { title: 'T', description: null, intent: null, blast: null, blastPartial: false, diff: [fact('a.ts', [[1, 2]])], specs: [], missing: [] as never[] };

  it('no patch text or @@ context leaks; ranges present', () => {
    const diff = toDiffFacts([{ path: 'src/foo.ts', additions: 3, deletions: 1, patch: '@@ -1,2 +5,3 @@ function secretCtx()\n+secretAdded\n-secretRemoved' }]);
    const { text } = buildFactsMessage({ ...base, diff }, 100);
    for (const s of ['secretAdded', 'secretRemoved', 'secretCtx', '@@']) expect(text).not.toContain(s);
    expect(text).toContain('src/foo.ts +3 -1');
    expect(text).toContain('5-7');
  });

  it('mentions every missing input; partial blast adds an incompleteness note', () => {
    const t = buildFactsMessage({ ...base, missing: ['intent', 'specs'] }, 0).text;
    expect(t).toContain('intent, specs');
    const p = buildFactsMessage({ ...base, blast: blast(), blastPartial: true }, 0).text;
    expect(p).toContain('caller list may be incomplete');
  });

  it('small input: nothing truncated', () => {
    const r = buildFactsMessage({ ...base, description: 'short' }, 100);
    expect(r.truncated).toEqual({ specs: false, description: false, callers: false, diffRows: 0 });
  });

  it('400 files + huge description + 5 docs + many callers -> <= 8000 est tokens, top-20 rows kept, "+N more files"', () => {
    const diff = Array.from({ length: 400 }, (_, i) => fact(`src/dir/file-${String(i).padStart(3, '0')}.ts`, [[1, 10], [20, 30]], 400 - i, 0));
    const callers = Array.from({ length: 100 }, (_, i) => ({ name: `c${i}`, file: `src/c${i}.ts`, line: i + 1 }));
    const r = buildFactsMessage(
      {
        title: 'Big', description: 'D'.repeat(200_000), intent: null,
        blast: blast({ downstream: [{ symbol: 'foo', callers, endpoints_affected: [], crons_affected: [] }] }),
        blastPartial: false, diff,
        specs: Array.from({ length: 5 }, (_, i) => ({ path: `docs/s${i}.md`, text: 'S'.repeat(20_000) })),
        missing: [],
      },
      800,
    );
    expect(r.estTokens).toBeLessThanOrEqual(8000);
    expect(r.truncated.callers).toBe(true);
    expect(r.truncated.diffRows).toBeGreaterThan(0);
    expect(r.text).toMatch(/\+\d+ more files \(\d+ additions, 0 deletions\)/);
    // highest-churn first; top 20 always kept
    for (let i = 0; i < 20; i++) expect(r.text).toContain(`src/dir/file-${String(i).padStart(3, '0')}.ts`);
    expect(r.text).not.toContain('src/dir/file-399.ts');
  });

  it('drop order: specs go first; description and callers survive when only specs overflow', () => {
    // Fill near the limit with specs so removing them is enough.
    const specs = Array.from({ length: 5 }, (_, i) => ({ path: `docs/s${i}.md`, text: 'S'.repeat(1600) }));
    const withSpecs = buildFactsMessage({ ...base, description: 'D'.repeat(3000), specs }, 0);
    expect(withSpecs.text).toContain('docs/s0.md');
    // push the system prompt so the total is over budget only because of specs
    const sysTokens = 8000 - (withSpecs.estTokens - 0) + 300;
    const r = buildFactsMessage({ ...base, description: 'D'.repeat(3000), specs }, sysTokens);
    expect(r.estTokens).toBeLessThanOrEqual(8000);
    expect(r.truncated.specs).toBe(true);
    expect(r.text).not.toContain('docs/s0.md');
    expect(r.truncated.description).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { EVAL_SEED_CASES, seedDiff, seedExpected } from './seed-eval.js';
import { parseUnifiedDiff } from '../adapters/git/diff-parser.js';
import { EvalExpectedShape } from '@devdigest/shared';

describe('eval seed set', () => {
  it('has ≥ 8 cases with ≥ 2 must_not_flag and ≥ 1 clean case; names are unique', () => {
    expect(EVAL_SEED_CASES.length).toBeGreaterThanOrEqual(8);
    expect(EVAL_SEED_CASES.filter((c) => c.kind === 'must_not_flag').length).toBeGreaterThanOrEqual(2);
    expect(EVAL_SEED_CASES.filter((c) => c.kind === 'none').length).toBeGreaterThanOrEqual(1);
    expect(new Set(EVAL_SEED_CASES.map((c) => c.name)).size).toBe(EVAL_SEED_CASES.length);
  });

  it.each(EVAL_SEED_CASES.map((c) => [c.name, c] as const))('%s: expectation is valid and inside the diff', (_n, c) => {
    const exp = EvalExpectedShape.parse(seedExpected(c));
    const diff = parseUnifiedDiff(seedDiff(c));
    const lines = new Set(diff.files.find((f) => f.path === c.file)?.hunks.flatMap((h) => h.newLineNumbers));
    for (const e of [...exp.must_find, ...exp.must_not_flag]) {
      for (let l = e.start_line; l <= e.end_line; l++) expect(lines.has(l), `${c.name}:${l}`).toBe(true);
    }
    if (c.kind === 'none') expect([...exp.must_find, ...exp.must_not_flag]).toEqual([]);
    else expect((c.kind === 'must_find' ? exp.must_find : exp.must_not_flag).length).toBe(1);
  });
});

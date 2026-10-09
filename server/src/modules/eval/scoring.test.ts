import { describe, it, expect } from 'vitest';
import { matches, rangesOverlap, scoreCase, metricsOf, type Expected, type Loc } from './scoring.js';

const loc = (file: string, s: number, e = s): Loc => ({ file, start_line: s, end_line: e });
const exp = (must_find: Loc[] = [], must_not_flag: Loc[] = []): Expected => ({ must_find, must_not_flag });
const score = (expected: Expected, findings: Loc[], droppedCount = 0) => scoreCase({ expected, findings, droppedCount });

describe('matching', () => {
  it('overlaps inclusively on the boundaries', () => {
    expect(rangesOverlap(loc('a', 1, 5), loc('a', 5, 9))).toBe(true);
    expect(rangesOverlap(loc('a', 1, 4), loc('a', 5, 9))).toBe(false);
  });
  it('requires the same file', () => {
    expect(matches(loc('a.ts', 3), loc('b.ts', 3))).toBe(false);
    expect(matches(loc('a.ts', 3), loc('a.ts', 1, 10))).toBe(true);
  });
});

describe('scoreCase', () => {
  it('found must_find → recall 1, precision 1, pass', () => {
    const s = score(exp([loc('a.ts', 12)]), [loc('a.ts', 11, 13)]);
    expect([s.recall, s.precision, s.citation_accuracy, s.pass]).toEqual([1, 1, 1, true]);
  });

  it('E1: right file, non-overlapping lines → not found, finding stays in the precision denominator', () => {
    const s = score(exp([loc('a.ts', 12)]), [loc('a.ts', 40)]);
    expect(s.recall).toBe(0);
    expect(s.pass).toBe(false);
    expect(s.counters.findings).toBe(1);
    expect(s.counters.noise).toBe(0);
  });

  it('E2: two findings on one expectation count it found once', () => {
    const s = score(exp([loc('a.ts', 12)]), [loc('a.ts', 12), loc('a.ts', 12, 13)]);
    expect(s.counters.expected_found).toBe(1);
    expect(s.recall).toBe(1);
    expect(s.precision).toBe(1);
  });

  it('E3: a finding hitting must_not_flag is noise and cannot satisfy must_find', () => {
    const s = score(exp([loc('a.ts', 5)], [loc('a.ts', 5)]), [loc('a.ts', 5)]);
    expect(s.counters.expected_found).toBe(0);
    expect(s.counters.noise).toBe(1);
    expect(s.precision).toBe(0);
    expect(s.pass).toBe(false);
  });

  it('must_not_flag only: re-flagging it fails, an unrelated finding does not', () => {
    const e = exp([], [loc('a.ts', 7)]);
    expect(score(e, [loc('a.ts', 7)]).pass).toBe(false);
    expect(score(e, [loc('b.ts', 1)]).pass).toBe(true);
    expect(score(e, []).pass).toBe(true);
  });

  it('clean case: any finding is noise; none passes', () => {
    expect(score(exp(), []).pass).toBe(true);
    const s = score(exp(), [loc('a.ts', 1)]);
    expect(s.pass).toBe(false);
    expect(s.precision).toBe(0);
  });

  it('E5/E6: undefined ratios are null, not 0 or 1', () => {
    const noExpected = score(exp(), []);
    expect(noExpected.recall).toBeNull();
    expect(noExpected.precision).toBeNull();
    expect(noExpected.citation_accuracy).toBeNull();
    const noFindings = score(exp([loc('a.ts', 1)]), []);
    expect(noFindings.recall).toBe(0);
    expect(noFindings.precision).toBeNull();
  });

  it('AC-18: findings dropped by the grounding gate lower citation_accuracy (2 of 3 survive)', () => {
    const s = score(exp([loc('a.ts', 1)]), [loc('a.ts', 1), loc('a.ts', 2)], 1);
    expect(s.counters.produced).toBe(3);
    expect(s.citation_accuracy).toBeCloseTo(2 / 3);
  });

  it('is deterministic', () => {
    const run = () => score(exp([loc('a.ts', 1, 3)], [loc('b.ts', 2)]), [loc('a.ts', 2), loc('b.ts', 2)], 2);
    expect(run()).toEqual(run());
  });
});

describe('metricsOf (micro aggregation)', () => {
  it('sums counters across cases instead of averaging ratios', () => {
    const big = score(exp([loc('a', 1), loc('a', 2), loc('a', 3), loc('a', 4)]), [loc('a', 1), loc('a', 2), loc('a', 3), loc('a', 4)]);
    const small = score(exp([loc('b', 1)]), []);
    const m = metricsOf([big.counters, small.counters]);
    expect(m.recall).toBeCloseTo(4 / 5); // macro average would be 0.5
    expect(m.precision).toBe(1);
  });
  it('returns nulls for an empty run', () => {
    expect(metricsOf([])).toEqual({ recall: null, precision: null, citation_accuracy: null });
  });
});

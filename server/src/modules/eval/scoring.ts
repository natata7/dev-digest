/**
 * Eval scoring — pure code, no model, no I/O.
 *
 * A finding "matches" an expectation when it is in the same file and the line
 * ranges overlap (inclusive). Everything below is counting over that relation,
 * so the same input always gives the same output.
 */

export interface Loc {
  file: string;
  start_line: number;
  end_line: number;
}

export interface Expected {
  must_find: Loc[];
  must_not_flag: Loc[];
}

/** Raw counts for one case — summed across cases for the micro-averaged run metrics. */
export interface Counters {
  expected_total: number;
  expected_found: number;
  /** Grounded findings (they survived the citation gate). */
  findings: number;
  /** Grounded findings that are noise (hit a must_not_flag, or any finding in a clean case). */
  noise: number;
  /** Findings the agent produced before the grounding gate (grounded + dropped). */
  produced: number;
}

export interface CaseScore {
  counters: Counters;
  pass: boolean;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

export interface RunMetrics {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

export function rangesOverlap(a: Loc, b: Loc): boolean {
  return a.start_line <= b.end_line && b.start_line <= a.end_line;
}

export function matches(finding: Loc, expectation: Loc): boolean {
  return finding.file === expectation.file && rangesOverlap(finding, expectation);
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den);

/**
 * Score one case.
 * - `findings` are the grounded findings; `droppedCount` is how many the grounding gate removed.
 * - A finding that hits a `must_not_flag` is noise and can never satisfy a `must_find` (E3).
 * - A clean case (both lists empty) treats every finding as noise.
 */
export function scoreCase(input: { expected: Expected; findings: Loc[]; droppedCount: number }): CaseScore {
  const { expected, findings, droppedCount } = input;
  const clean = expected.must_find.length === 0 && expected.must_not_flag.length === 0;

  const flagged = findings.filter((f) => expected.must_not_flag.some((e) => matches(f, e)));
  const eligible = findings.filter((f) => !flagged.includes(f));
  const found = expected.must_find.filter((e) => eligible.some((f) => matches(f, e))).length;
  const noise = clean ? findings.length : flagged.length;

  const counters: Counters = {
    expected_total: expected.must_find.length,
    expected_found: found,
    findings: findings.length,
    noise,
    produced: findings.length + droppedCount,
  };
  return {
    counters,
    pass: found === expected.must_find.length && noise === 0,
    ...metricsOf([counters]),
  };
}

/** Micro-average: sum the counters, then divide (not an average of per-case ratios). */
export function metricsOf(all: Counters[]): RunMetrics {
  const sum = all.reduce(
    (a, c) => ({
      expected_total: a.expected_total + c.expected_total,
      expected_found: a.expected_found + c.expected_found,
      findings: a.findings + c.findings,
      noise: a.noise + c.noise,
      produced: a.produced + c.produced,
    }),
    { expected_total: 0, expected_found: 0, findings: 0, noise: 0, produced: 0 },
  );
  return {
    recall: ratio(sum.expected_found, sum.expected_total),
    precision: ratio(sum.findings - sum.noise, sum.findings),
    citation_accuracy: ratio(sum.findings, sum.produced),
  };
}

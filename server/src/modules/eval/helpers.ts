import { EvalExpectedShape, normalizeExpectedOutput } from '@devdigest/shared';
import type { EvalCaseRecord, EvalExpectationKind } from '@devdigest/shared';
import type { EvalCaseRow, EvalCaseRunRow } from './repository.js';
import type { Loc } from './scoring.js';

/** Mask secret-looking values so an eval set never becomes a secrets store. Line count is preserved. */
const SECRET_PATTERNS: Array<[RegExp, string | ((m: string, ...g: string[]) => string)]> = [
  [/\b((?:sk|rk|pk)_(?:live|test)_)[A-Za-z0-9]{6,}/g, '$1********'],
  [/\b(gh[pousr]_)[A-Za-z0-9]{16,}/g, '$1********'],
  [/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA****************'],
  [/\b(xox[baprs]-)[A-Za-z0-9-]{8,}/g, '$1********'],
  [
    /((?:api[_-]?key|secret|token|passw(?:or)?d)\w*["']?\s*[:=]\s*["'])([^"'\s]{12,})(["'])/gi,
    (_m, a, _v, c) => `${a}********${c}`,
  ],
];

export function maskSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((acc, [re, rep]) => acc.replace(re, rep as string), text);
}

/**
 * Cut the part of `raw` (a unified diff) that matters for one finding: the file's
 * header plus every hunk whose new-side range touches `[start - ctx, end + ctx]`.
 * Returns null when no hunk of that file reaches the range.
 */
export function cutFragment(raw: string, file: string, start: number, end: number, ctx: number): string | null {
  const lines = raw.split('\n');
  const sections: string[][] = [];
  for (const line of lines) {
    if (line.startsWith('diff --git')) sections.push([line]);
    else if (sections.length) sections[sections.length - 1]!.push(line);
  }
  const section = sections.find((s) => s.some((l) => l.startsWith('+++ ') && l.slice(4).replace(/^b\//, '').trim() === file));
  if (!section) return null;

  const header: string[] = [];
  const hunks: string[][] = [];
  for (const line of section) {
    if (line.startsWith('@@')) hunks.push([line]);
    else if (hunks.length) hunks[hunks.length - 1]!.push(line);
    else header.push(line);
  }
  const lo = start - ctx;
  const hi = end + ctx;
  const kept = hunks.filter((h) => {
    const m = h[0]!.match(/\+(\d+)(?:,(\d+))?/);
    if (!m) return false;
    const s = Number(m[1]);
    const n = m[2] === undefined ? 1 : Number(m[2]);
    return s <= hi && s + Math.max(n, 1) - 1 >= lo;
  });
  if (kept.length === 0) return null;
  return [...header, ...kept.flat()].join('\n').replace(/\n+$/, '') + '\n';
}

/** accepted → must_find, dismissed → must_not_flag; if both, the later decision wins; undecided → requested ?? must_find. */
export function expectationFor(
  f: { acceptedAt: Date | null; dismissedAt: Date | null },
  requested?: 'must_find' | 'must_not_flag',
): 'must_find' | 'must_not_flag' {
  if (f.acceptedAt && f.dismissedAt) return f.dismissedAt > f.acceptedAt ? 'must_not_flag' : 'must_find';
  if (f.acceptedAt) return 'must_find';
  if (f.dismissedAt) return 'must_not_flag';
  return requested ?? 'must_find';
}

/** `Hardcoded Stripe key!` → `hardcoded-stripe-key`; made unique among `taken` with a -2, -3… suffix. */
export function caseName(title: string, taken: Iterable<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'eval-case';
  const set = new Set(taken);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

const sameLoc = (a: Loc, b: Loc) => a.file === b.file && a.start_line === b.start_line && a.end_line === b.end_line;

/** An existing case that already asserts the same thing: same source finding, or same location and kind. */
export function findDuplicate(
  cases: EvalCaseRow[],
  kind: 'must_find' | 'must_not_flag',
  loc: Loc,
  findingId: string,
): EvalCaseRow | undefined {
  return cases.find((c) => {
    if (c.expectationKind !== kind) return false;
    if (c.sourceFindingId === findingId) return true;
    const exp = parseExpected(c.expectedOutput);
    return exp[kind].some((e) => sameLoc(e, loc));
  });
}

/** Tolerant read of a stored `expected_output` (legacy arrays, nulls). */
export function parseExpected(raw: unknown): EvalExpectedShape {
  const r = EvalExpectedShape.safeParse(normalizeExpectedOutput(raw));
  return r.success ? r.data : { must_find: [], must_not_flag: [] };
}

export function kindOfExpected(e: EvalExpectedShape): EvalExpectationKind {
  if (e.must_find.length > 0) return 'must_find';
  if (e.must_not_flag.length > 0) return 'must_not_flag';
  return 'none';
}

export function toCaseRecord(row: EvalCaseRow, last?: EvalCaseRunRow): EvalCaseRecord {
  return {
    id: row.id,
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_meta: row.inputMeta ?? null,
    expected_output: parseExpected(row.expectedOutput),
    expectation_kind: row.expectationKind,
    source_finding_id: row.sourceFindingId ?? null,
    notes: row.notes ?? null,
    last_run: last ? { pass: last.pass, status: last.status, ran_at: last.ranAt.toISOString() } : null,
  };
}

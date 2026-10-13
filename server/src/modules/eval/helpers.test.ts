import { describe, it, expect } from 'vitest';
import { maskSecrets, cutFragment, expectationFor, caseName, findDuplicate, parseExpected } from './helpers.js';
import type { EvalCaseRow } from './repository.js';

// built at runtime so no key-shaped literal sits in the repo (GitHub push protection)
const KEY_TAIL = '51H8xq2Ka9Vn3PqLm7Rd0bZ4Xc';

const RAW = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,6 +10,7 @@
 export const config = {
   port: 1,
+  stripeKey: "sk_live_${KEY_TAIL}",
   redisUrl: x,
 };
@@ -200,3 +201,4 @@
 far
+away
 end
diff --git a/src/other.ts b/src/other.ts
--- a/src/other.ts
+++ b/src/other.ts
@@ -1,2 +1,3 @@
 a
+b
 c
`;

describe('maskSecrets', () => {
  it('masks Stripe/GitHub/AWS keys and generic assignments, keeping line count', () => {
    const src = `a "sk_live_${KEY_TAIL}"\nb ghp_abcdefghijklmnopqrstuv\nc AKIAIOSFODNN7EXAMPLE\nd apiKey: "abcdefghijkl1234"`;
    const out = maskSecrets(src);
    expect(out).not.toMatch(/51H8xq2|abcdefghijklmnop|IOSFODNN7|abcdefghijkl1234/);
    expect(out.split('\n')).toHaveLength(4);
    expect(out).toContain('sk_live_********');
  });
  it('leaves ordinary code alone', () => {
    const src = 'const token = getToken();\nfoo("bar")';
    expect(maskSecrets(src)).toBe(src);
  });
});

describe('cutFragment', () => {
  it('keeps the file header and only the hunk near the range', () => {
    const out = cutFragment(RAW, 'src/config.ts', 12, 12, 20)!;
    expect(out).toContain('+++ b/src/config.ts');
    expect(out).toContain('@@ -10,6 +10,7 @@');
    expect(out).not.toContain('@@ -200,3');
    expect(out).not.toContain('other.ts');
  });
  it('returns null when no hunk reaches the range or the file is absent', () => {
    expect(cutFragment(RAW, 'src/config.ts', 100, 100, 5)).toBeNull();
    expect(cutFragment(RAW, 'nope.ts', 1, 1, 20)).toBeNull();
  });
});

describe('expectationFor', () => {
  const d = (n: number) => new Date(n);
  it('maps decisions to expectation kinds', () => {
    expect(expectationFor({ acceptedAt: d(1), dismissedAt: null })).toBe('must_find');
    expect(expectationFor({ acceptedAt: null, dismissedAt: d(1) })).toBe('must_not_flag');
    expect(expectationFor({ acceptedAt: d(1), dismissedAt: d(2) })).toBe('must_not_flag');
    expect(expectationFor({ acceptedAt: null, dismissedAt: null })).toBe('must_find');
    expect(expectationFor({ acceptedAt: null, dismissedAt: null }, 'must_not_flag')).toBe('must_not_flag');
  });
});

describe('caseName', () => {
  it('slugifies and de-duplicates', () => {
    expect(caseName('Hardcoded Stripe key!', [])).toBe('hardcoded-stripe-key');
    expect(caseName('Hardcoded Stripe key!', ['hardcoded-stripe-key', 'hardcoded-stripe-key-2'])).toBe('hardcoded-stripe-key-3');
    expect(caseName('!!!', [])).toBe('eval-case');
  });
});

describe('findDuplicate', () => {
  const row = (over: Partial<EvalCaseRow>): EvalCaseRow =>
    ({ id: 'c', expectationKind: 'must_find', sourceFindingId: null, expectedOutput: { must_find: [], must_not_flag: [] }, ...over }) as EvalCaseRow;
  const loc = { file: 'a.ts', start_line: 3, end_line: 4 };
  it('matches by source finding or by identical location+kind', () => {
    expect(findDuplicate([row({ sourceFindingId: 'f1' })], 'must_find', loc, 'f1')).toBeDefined();
    const byLoc = row({ expectedOutput: { must_find: [loc], must_not_flag: [] } });
    expect(findDuplicate([byLoc], 'must_find', loc, 'other')).toBeDefined();
    expect(findDuplicate([byLoc], 'must_not_flag', loc, 'other')).toBeUndefined();
  });
});

describe('parseExpected', () => {
  it('tolerates null and legacy arrays', () => {
    expect(parseExpected(null)).toEqual({ must_find: [], must_not_flag: [] });
    expect(parseExpected([{ file: 'a', start_line: 2 }]).must_find[0]!.end_line).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { buildSmartDiff } from './build.js';
import { ROLE_ORDER } from './constants.js';

describe('buildSmartDiff', () => {
  it('emits all 5 groups in ROLE_ORDER, even when empty', () => {
    const d = buildSmartDiff([], new Map());
    expect(d.groups.map((g) => g.role)).toEqual(ROLE_ORDER);
    expect(d.groups.every((g) => g.files.length === 0)).toBe(true);
  });

  it('buckets files by classified role and sums total_lines', () => {
    const d = buildSmartDiff(
      [
        { path: 'src/service.ts', additions: 10, deletions: 2 },
        { path: 'src/service.test.ts', additions: 5, deletions: 0 },
        { path: 'README.md', additions: 1, deletions: 1 },
      ],
      new Map(),
    );
    const byRole = Object.fromEntries(d.groups.map((g) => [g.role, g.files.map((f) => f.path)]));
    expect(byRole.core).toEqual(['src/service.ts']);
    expect(byRole.tests).toEqual(['src/service.test.ts']);
    expect(byRole.docs).toEqual(['README.md']);
    expect(d.split_suggestion).toEqual({ too_big: false, total_lines: 19, proposed_splits: [] });
  });

  it('sorts and de-dupes finding_lines per path', () => {
    const d = buildSmartDiff(
      [{ path: 'src/service.ts', additions: 1, deletions: 0 }],
      new Map([['src/service.ts', [42, 7, 42, 7, 10]]]),
    );
    const file = d.groups.find((g) => g.role === 'core')!.files[0]!;
    expect(file.finding_lines).toEqual([7, 10, 42]);
  });

  it('a path with no findings gets an empty finding_lines array', () => {
    const d = buildSmartDiff([{ path: 'src/service.ts', additions: 1, deletions: 0 }], new Map());
    expect(d.groups.find((g) => g.role === 'core')!.files[0]!.finding_lines).toEqual([]);
  });
});

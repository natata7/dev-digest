import { describe, it, expect } from 'vitest';
import { EvalExpectedOutput, EvalCaseInput } from '@devdigest/shared';

describe('eval contracts', () => {
  it('accepts the {must_find, must_not_flag} shape', () => {
    const out = EvalExpectedOutput.parse({
      must_find: [{ file: 'a.ts', start_line: 3, end_line: 5 }],
      must_not_flag: [{ file: 'b.ts', start_line: 1, end_line: 1 }],
    });
    expect(out.must_find).toHaveLength(1);
    expect(out.must_not_flag).toHaveLength(1);
  });

  it('maps the legacy array form to must_find and defaults end_line to start_line', () => {
    const out = EvalExpectedOutput.parse([
      { severity: 'CRITICAL', category: 'security', title: 't', file: 'src/config.ts', start_line: 12 },
    ]);
    expect(out.must_find[0]).toMatchObject({ file: 'src/config.ts', start_line: 12, end_line: 12 });
    expect(out.must_not_flag).toEqual([]);
  });

  it('treats an empty object and an empty array as a clean case', () => {
    expect(EvalExpectedOutput.parse({})).toEqual({ must_find: [], must_not_flag: [] });
    expect(EvalExpectedOutput.parse([])).toEqual({ must_find: [], must_not_flag: [] });
  });

  it('rejects a range with end_line < start_line', () => {
    expect(
      EvalExpectedOutput.safeParse({ must_find: [{ file: 'a.ts', start_line: 9, end_line: 2 }] }).success,
    ).toBe(false);
  });

  it('EvalCaseInput normalizes expected_output', () => {
    const c = EvalCaseInput.parse({
      owner_kind: 'agent',
      owner_id: 'x',
      name: 'n',
      expected_output: [{ file: 'a.ts', start_line: 1 }],
    });
    expect(c.expected_output.must_find[0]!.end_line).toBe(1);
  });
});

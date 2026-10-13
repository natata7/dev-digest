import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { scoreCase } from './scoring.js';

const FORBIDDEN = [/adapters\//, /platform\/container/, /\bopenai\b/i, /@anthropic-ai/, /reviewer-core/, /\bfetch\s*\(/, /\bhttps?:\/\//];

describe('eval scoring makes no LLM or network call (AC-15)', () => {
  const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'scoring.ts'), 'utf8');
  const imports = src.split('\n').filter((l) => /^\s*(import|export .* from)\b/.test(l));

  it('scoring.ts imports nothing', () => {
    expect(imports, `scoring.ts must be dependency-free, found: ${imports.join(' | ')}`).toEqual([]);
  });

  it.each(FORBIDDEN.map((r) => [String(r), r] as const))('scoring.ts does not reference %s', (_n, re) => {
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(re.test(code), `scoring.ts matched forbidden pattern ${re}`).toBe(false);
  });

  it('runs with fetch replaced by a throwing stub', () => {
    const real = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('network is forbidden in scoring');
    }) as typeof fetch;
    try {
      const s = scoreCase({
        expected: { must_find: [{ file: 'a.ts', start_line: 1, end_line: 1 }], must_not_flag: [] },
        findings: [{ file: 'a.ts', start_line: 1, end_line: 1 }],
        droppedCount: 0,
      });
      expect(s.pass).toBe(true);
    } finally {
      globalThis.fetch = real;
    }
  });
});

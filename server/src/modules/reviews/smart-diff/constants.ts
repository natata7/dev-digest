import type { SmartDiffRole } from '@devdigest/shared';

/** Display order for Smart Diff groups in the UI (enum member order in the
 *  shared contract already matches this — kept as an explicit local export
 *  so build.ts doesn't need to import the Zod enum just to iterate it). */
export const ROLE_ORDER: SmartDiffRole[] = ['core', 'tests', 'wiring', 'docs', 'boilerplate'];

type PatternKind = 'suffix' | 'basename' | 'basenamePrefix' | 'segment';

interface Pattern {
  kind: PatternKind;
  value: string;
}

export interface RoleRule {
  role: Exclude<SmartDiffRole, 'core'>;
  patterns: Pattern[];
}

const suffix = (value: string): Pattern => ({ kind: 'suffix', value });
const basename = (value: string): Pattern => ({ kind: 'basename', value });
const basenamePrefix = (value: string): Pattern => ({ kind: 'basenamePrefix', value });
const segment = (value: string): Pattern => ({ kind: 'segment', value });

/**
 * Rule buckets walked TOP-DOWN by classify.ts — first matching bucket wins,
 * everything unmatched falls through to `core`. Bucket ORDER is load-bearing,
 * not incidental:
 *
 *  - boilerplate BEFORE tests — a snapshot fixture under `__tests__/__snapshots__`
 *    is generated output, not test logic, even though it's nested inside a
 *    `__tests__` dir.
 *  - tests BEFORE wiring/docs — `e2e/README.md` is still part of the e2e test
 *    suite's own surface, not project documentation, despite the `.md` ext.
 *  - wiring BEFORE docs — a skill's SKILL.md under `.claude/skills` configures
 *    agent behavior (wiring), not project documentation, despite the `.md` ext.
 */
export const CLASSIFY_RULES: RoleRule[] = [
  {
    role: 'boilerplate',
    patterns: [
      basename('pnpm-lock.yaml'),
      basename('package-lock.json'),
      basename('yarn.lock'),
      segment('dist'),
      segment('__snapshots__'),
      suffix('.min.js'),
      suffix('.min.css'),
      suffix('.generated.ts'),
      suffix('.generated.js'),
    ],
  },
  {
    role: 'tests',
    patterns: [
      suffix('.test.ts'),
      suffix('.test.tsx'),
      suffix('.test.js'),
      suffix('.test.jsx'),
      suffix('.spec.ts'),
      suffix('.spec.tsx'),
      segment('__tests__'),
      segment('e2e'),
    ],
  },
  {
    // Basename checks below are exact-match, never substring: index.ts and
    // src/x/index.ts are wiring (barrel files), but src/indexer.ts is NOT
    // (it just happens to start with "index").
    role: 'wiring',
    patterns: [
      basename('index.ts'),
      basename('index.tsx'),
      basename('index.js'),
      basename('index.jsx'),
      basename('vitest.config.ts'),
      basename('tsconfig.json'),
      basename('docker-compose.yml'),
      basename('docker-compose.yaml'),
      basenamePrefix('.env'),
      segment('.github'),
      segment('.claude'),
    ],
  },
  {
    role: 'docs',
    patterns: [
      basename('README.md'),
      basename('LICENSE'),
      basename('LICENSE.md'),
      segment('docs'),
      suffix('.md'),
    ],
  },
];

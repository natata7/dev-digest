import { describe, expect, it } from 'vitest';
import { classifyFile } from './classify.js';

describe('classifyFile', () => {
  it.each([
    // ---- boilerplate ----
    ['pnpm-lock.yaml', 'boilerplate'],
    ['dist/x.js', 'boilerplate'],
    ['src/x.min.js', 'boilerplate'],
    ['src/x.generated.ts', 'boilerplate'],

    // ---- tests ----
    ['foo.test.ts', 'tests'],
    ['foo.it.test.ts', 'tests'],
    ['src/__tests__/a.ts', 'tests'],
    ['e2e/run.ts', 'tests'],

    // ---- wiring ----
    ['src/x/index.ts', 'wiring'],
    ['index.ts', 'wiring'],
    ['vitest.config.ts', 'wiring'],
    ['tsconfig.json', 'wiring'],
    ['.env.local', 'wiring'],
    ['docker-compose.yml', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],

    // ---- docs ----
    ['README.md', 'docs'],
    ['docs/specs/a.md', 'docs'],
    ['LICENSE', 'docs'],

    // ---- core (fallback) ----
    ['src/modules/foo/service.ts', 'core'],

    // ---- disputed cases: rule ORDER decides these, see constants.ts's
    // CLASSIFY_RULES docstring for the full rationale ----
    // boilerplate is checked before tests, so a snapshot fixture nested under
    // a `__tests__` dir is generated output, not test logic.
    ['__tests__/__snapshots__/x.snap', 'boilerplate'],
    // wiring is checked before docs, so a skill definition wires agent
    // behavior despite the `.md` extension.
    ['.claude/skills/security/SKILL.md', 'wiring'],
    // tests is checked before docs, so a README inside e2e/ is still part of
    // the test suite's own surface, not project documentation.
    ['e2e/README.md', 'tests'],

    // ---- guard: the wiring `index.*` rule is basename-exact, not a
    // substring match — proves it doesn't accidentally catch `indexer.ts`.
    ['index.ts', 'wiring'],
    ['src/x/index.ts', 'wiring'],
    ['src/indexer.ts', 'core'],
  ])('%s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});

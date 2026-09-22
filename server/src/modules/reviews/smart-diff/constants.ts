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
      basename('composer.lock'),
      segment('dist'),
      segment('build'),
      segment('__snapshots__'),
      suffix('.snap'),
      suffix('.min.js'),
      suffix('.min.css'),
      suffix('.generated.ts'),
      suffix('.generated.js'),
      // Vendored/third-party dependency trees — never hand-authored by this
      // team, regardless of language (npm's node_modules, composer's vendor,
      // used by both Laravel and WordPress plugins).
      segment('vendor'),
      segment('node_modules'),
      // WordPress core itself, when committed alongside wp-content (rare but
      // happens with some deploy setups) — vendored, not custom code.
      segment('wp-admin'),
      segment('wp-includes'),
      // User-uploaded media (wp-content/uploads) and runtime/compiled output
      // (Laravel's storage/ + bootstrap/cache/) — generated or user data,
      // never business logic to review.
      segment('uploads'),
      segment('storage'),
      segment('cache'),
      // Compiled gettext translation catalogs (WordPress/PHP i18n tooling).
      suffix('.mo'),
      basename('mix-manifest.json'),
      // Static assets (webfonts, images) — no logic to review, just binaries.
      segment('fonts'),
      segment('img'),
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
      // PHPUnit's default suite dir (Laravel scaffolds `tests/Feature`,
      // `tests/Unit`; WordPress plugin boilerplates use `tests/` too) and the
      // PHPUnit test-class naming convention (FooTest.php).
      segment('tests'),
      segment('test'),
      suffix('Test.php'),
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
      basename('package.json'),
      basename('docker-compose.yml'),
      basename('docker-compose.yaml'),
      basenamePrefix('.env'),
      segment('.github'),
      segment('.claude'),
      // Laravel: route declarations, the config/ tree, the CLI entrypoint,
      // and PHPUnit's own config — all structural/framework scaffolding, not
      // business logic. database/ is migrations + seeders + factories:
      // schema/fixture definitions, judged like this repo's own db
      // migrations (structural, not something a reviewer reads like app code).
      segment('routes'),
      segment('config'),
      segment('database'),
      basename('artisan'),
      basename('composer.json'),
      basename('phpunit.xml'),
      basename('phpunit.xml.dist'),
      // WordPress site config (DB credentials, salts) — hand-edited config,
      // not application logic.
      basename('wp-config.php'),
      // Build/lint/deploy tool config, any language — CI pipelines, git
      // hooks, editor/IDE settings and snippets, SFTP deploy credentials
      // template, PHP_CodeSniffer ruleset. None of it is application code.
      segment('.vscode'),
      segment('.husky'),
      segment('.cursor'),
      basename('.gitlab-ci.yml'),
      basename('phpcs.xml'),
      basename('phpcs.xml.dist'),
      suffix('.config.js'),
      suffix('.config.ts'),
      suffix('.config.mjs'),
      // WordPress block themes (underscores.me-style boilerplates): design
      // tokens/editor settings, and the theme-metadata stub WP core requires
      // at the theme root (the *compiled* stylesheet lives under build/,
      // already covered by the boilerplate `build` rule above). Note:
      // "style.css" is a generic basename — a non-WP-theme repo with a real
      // hand-authored root stylesheet would be misclassified by this rule.
      basename('theme.json'),
      basename('style.css'),
      // ACF field-group JSON — exported by the ACF admin UI when a field
      // group is saved, not hand-typed each time; treated like the
      // migrations judgment above (structural/schema, not prose-reviewed
      // app code).
      segment('acf-json'),
      // Theme tooling that never deploys to the server (build scripts, the
      // block-scaffold CLI template, `npm run init`/`create-block` helpers).
      // Unlike the rules above, "dev" is this specific boilerplate's own
      // convention, not an ecosystem-wide one — a repo that keeps real
      // application code under a top-level `dev/` folder would be
      // misclassified.
      segment('dev'),
    ],
  },
  {
    role: 'docs',
    patterns: [
      basename('README.md'),
      basename('LICENSE'),
      basename('LICENSE.md'),
      // WordPress.org's plugin/theme readme standard (lowercase .txt, not
      // README.md).
      basename('readme.txt'),
      segment('docs'),
      suffix('.md'),
    ],
  },
];

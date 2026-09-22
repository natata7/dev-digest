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

    // ---- WordPress ----
    ['wp-content/plugins/acme/acme.php', 'core'], // custom plugin logic — reviewed like any other code
    ['wp-content/themes/acme/functions.php', 'core'], // theme logic — real business logic, not classified as wiring
    ['wp-content/uploads/2026/09/photo.jpg', 'boilerplate'], // user media
    ['wp-admin/admin.php', 'boilerplate'], // vendored WP core
    ['wp-includes/functions.php', 'boilerplate'], // vendored WP core
    ['wp-config.php', 'wiring'], // hand-edited site config
    ['languages/acme-uk.mo', 'boilerplate'], // compiled translation catalog
    ['readme.txt', 'docs'], // WordPress.org plugin/theme readme standard

    // ---- Laravel ----
    ['routes/web.php', 'wiring'],
    ['config/database.php', 'wiring'],
    ['database/migrations/2026_01_01_create_users_table.php', 'wiring'],
    ['database/seeders/UserSeeder.php', 'wiring'],
    ['database/factories/UserFactory.php', 'wiring'],
    ['app/Http/Controllers/UserController.php', 'core'], // real app code stays core
    ['artisan', 'wiring'],
    ['composer.json', 'wiring'],
    ['composer.lock', 'boilerplate'],
    ['phpunit.xml', 'wiring'],
    ['tests/Feature/ExampleTest.php', 'tests'],
    ['tests/Unit/UserTest.php', 'tests'],
    ['storage/logs/laravel.log', 'boilerplate'],
    ['bootstrap/cache/config.php', 'boilerplate'],
    ['public/build/assets/app.js', 'boilerplate'], // Vite/Mix compiled output
    ['public/mix-manifest.json', 'boilerplate'],

    // ---- disputed: database/ before docs/core means migrations are wiring,
    // not core, even though a migration's up()/down() is real schema logic —
    // judged the same way this repo treats its own db/migrations as
    // structural history rather than app code to review line-by-line.
    ['database/migrations/2026_01_01_add_index.php', 'wiring'],

    // ---- WordPress block theme (underscores.me-style boilerplate) ----
    ['.vscode/sftp.json-template', 'wiring'], // deploy config template, not a secret (real sftp.json is gitignored)
    ['.vscode/demchco.code-snippets', 'wiring'],
    ['.husky/pre-commit', 'wiring'],
    ['.cursor/rules/theme.mdc', 'wiring'],
    ['.gitlab-ci.yml', 'wiring'],
    ['theme.json', 'wiring'], // Gutenberg design tokens / editor settings
    ['style.css', 'wiring'], // WP-required theme metadata header, not the real compiled CSS
    ['webpack.config.js', 'wiring'],
    ['acf-json/group_64a1b2c3d4e5f.json', 'wiring'], // ACF-exported field group, not hand-authored
    ['dev/bin/init-theme.js', 'wiring'], // theme tooling, never deployed
    ['dev/tools/block-template/block.json', 'wiring'],
    ['phpcs.xml', 'wiring'],
    ['fonts/roboto/Roboto-Regular.woff2', 'boilerplate'],
    ['img/hero.jpg', 'boilerplate'],
    ['src/blocks/faq/block.php', 'core'], // actual ACF block logic — reviewed, not wiring
    // ---- disputed: Gutenberg's convention makes a block's index.js its real
    // registration+logic entry point, not a re-export barrel — but the
    // basename('index.js') wiring rule can't tell the two apart from the
    // path alone, so real block code here still lands in wiring. Same
    // review-visibility caveat as the migrations case: findings still show,
    // it's only the group that's "wrong". Flagged as a known limitation
    // rather than silently accepted.
    ['src/blocks/gallery-slider/index.js', 'wiring'],
    ['src/css/main.scss', 'core'],
    ['src/js/site.js', 'core'],
    ['inc/snippets/disable-comments.php', 'core'], // optional module — real behavior when enabled, worth reviewing
    ['inc/template-functions.php', 'core'],
    ['template-parts/content.php', 'core'],
    ['js/swiper-bundle.min.js', 'boilerplate'], // caught by the generic .min.js rule, not a directory rule
  ])('%s -> %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });
});

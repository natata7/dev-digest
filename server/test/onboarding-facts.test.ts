import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { collectCloneFacts } from '../src/modules/onboarding/facts.js';
import { readInsideClone } from '../src/modules/_shared/clone-fs.js';

let root: string;
let outside: string;

async function put(rel: string, content = 'x', base = root) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content);
}
const pkg = (o: object) => JSON.stringify(o);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'onb-clone-'));
  outside = await mkdtemp(join(tmpdir(), 'onb-outside-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('manifests / stack (AC-8, E6, E8, E9)', () => {
  it('root + only 10 nested (depth<=2, path ASC); node_modules and depth 3 ignored', async () => {
    await put('package.json', pkg({ name: 'root', dependencies: { react: '1' } }));
    for (let i = 1; i <= 12; i++) await put(`packages/p${String(i).padStart(2, '0')}/package.json`, pkg({ name: `p${i}` }));
    await put('node_modules/dep/package.json', pkg({ name: 'dep' }));
    await put('a/b/c/package.json', pkg({ name: 'too-deep' }));
    const f = await collectCloneFacts(root);
    const paths = f.manifests.map((m) => m.path);
    expect(paths[0]).toBe('package.json');
    expect(paths).toHaveLength(11);
    expect(paths).not.toContain('node_modules/dep/package.json');
    expect(paths).not.toContain('a/b/c/package.json');
    expect(paths.slice(1)).toEqual([...paths.slice(1)].sort());
    expect(paths).toContain('packages/p10/package.json');
    expect(paths).not.toContain('packages/p11/package.json');
    expect(f.manifests[0]).toMatchObject({ name: 'root', dependencies: ['react'] });
  });

  it('detects presence manifests; Go-only repo has empty stack without error', async () => {
    await put('go.mod', 'module x');
    await put('Dockerfile', 'FROM x');
    await put('Makefile', 'all:');
    const f = await collectCloneFacts(root);
    expect(f.manifests).toEqual([]);
    expect(f.presence).toEqual(['Dockerfile', 'Makefile', 'go.mod']);
  });

  it('empty repo (no package.json, no README) works (E9)', async () => {
    const f = await collectCloneFacts(root);
    expect(f.manifests).toEqual([]);
    expect(f.readme).toBeNull();
    expect(f.scripts).toEqual([]);
  });

  it('malformed package.json is listed without deps/scripts', async () => {
    await put('package.json', '{not json');
    const f = await collectCloneFacts(root);
    expect(f.manifests).toHaveLength(1);
    expect(f.manifests[0]!.dependencies).toEqual([]);
    expect(f.scripts).toEqual([]);
  });
});

describe('scripts (AC-9, AC-16, E20)', () => {
  it('caps at 30, root first then path ASC, command at 200 chars, total kept', async () => {
    const rootScripts = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`r${String(i).padStart(2, '0')}`, 'echo']));
    rootScripts.long = 'z'.repeat(300);
    const nested = Object.fromEntries(Array.from({ length: 14 }, (_, i) => [`n${i}`, 'echo']));
    await put('package.json', pkg({ scripts: rootScripts }));
    await put('apps/web/package.json', pkg({ scripts: nested }));
    const f = await collectCloneFacts(root);
    expect(f.scripts).toHaveLength(30);
    expect(f.scriptsTotal).toBe(35);
    expect(f.scripts.slice(0, 21).every((s) => s.manifest === 'package.json')).toBe(true);
    expect(f.scripts[21]!.manifest).toBe('apps/web/package.json');
    expect(f.scripts.find((s) => s.name === 'long')!.command).toHaveLength(200);
  });
});

describe('structure (AC-10, AC-16)', () => {
  it('caps at 40 ordered by file count DESC then path ASC, excluded dirs skipped', async () => {
    for (let i = 0; i < 45; i++) await put(`d${String(i).padStart(2, '0')}/f.txt`);
    await put('big/a.txt');
    await put('big/b.txt');
    await put('big/c.txt');
    await put('dist/out.js');
    await put('node_modules/x/y.js');
    const f = await collectCloneFacts(root);
    expect(f.structure).toHaveLength(40);
    expect(f.structureTotal).toBe(46);
    expect(f.structure[0]).toEqual({ path: 'big', files: 3 });
    expect(f.structure[1]!.path).toBe('d00');
    const names = f.structure.map((s) => s.path);
    expect(names).not.toContain('dist');
    expect(names).not.toContain('node_modules');
  });

  it('counts files recursively and includes depth-2 dirs', async () => {
    await put('src/a/x.ts');
    await put('src/a/deep/y.ts');
    await put('src/z.ts');
    const f = await collectCloneFacts(root);
    expect(f.structure).toEqual([
      { path: 'src', files: 3 },
      { path: 'src/a', files: 2 },
    ]);
  });
});

describe('determinism (AC-15)', () => {
  it('two collections over the same dir are identical', async () => {
    await put('package.json', pkg({ name: 'n', scripts: { a: 'b' }, dependencies: { z: '1', a: '1' } }));
    await put('src/x.ts');
    await put('README.md', '# hi');
    expect(JSON.stringify(await collectCloneFacts(root))).toBe(JSON.stringify(await collectCloneFacts(root)));
  });
});

describe('env files (AC-35, E18)', () => {
  it('reads names only from templates, never values, never .env / .env.local', async () => {
    await put('.env', 'REAL_SECRET=hunter2-real');
    await put('.env.local', 'LOCAL_SECRET=hunter2-local');
    await put('.env.production', 'PROD_SECRET=hunter2-prod');
    await put('.env.example', '# comment\nAPI_KEY=sk-live-VALUE\nexport DB_URL="postgres://u:p@h/db"\nAPI_KEY=dup\n');
    const f = await collectCloneFacts(root);
    expect(f.env).toEqual([{ file: '.env.example', names: ['API_KEY', 'DB_URL'] }]);
    const blob = JSON.stringify(f);
    for (const leak of ['hunter2', 'sk-live-VALUE', 'postgres://', 'REAL_SECRET', 'LOCAL_SECRET', 'PROD_SECRET']) {
      expect(blob).not.toContain(leak);
    }
  });
});

describe('README (AC-34, E20)', () => {
  it('excerpt capped at 4000 chars', async () => {
    await put('README.md', 'a'.repeat(9000));
    const f = await collectCloneFacts(root);
    expect(f.readme!.path).toBe('README.md');
    expect(f.readme!.excerpt).toHaveLength(4000);
  });
});

describe('symlinks and path safety (NFR-4)', () => {
  it('symlinked file and dir pointing outside the clone are skipped', async () => {
    await put('secret.txt', 'TOP-SECRET', outside);
    await put('package.json', pkg({ name: 'leak', scripts: { leak: 'x' } }), outside);
    await put('README.md', 'OUTSIDE README', outside);
    await symlink(join(outside, 'README.md'), join(root, 'README.md'));
    await symlink(outside, join(root, 'linked'));
    await symlink(join(outside, 'package.json'), join(root, 'package.json'));
    await put('src/ok.ts');
    const f = await collectCloneFacts(root);
    const blob = JSON.stringify(f);
    expect(blob).not.toContain('OUTSIDE README');
    expect(blob).not.toContain('leak');
    expect(f.readme).toBeNull();
    expect(f.manifests).toEqual([]);
    expect(f.structure.map((s) => s.path)).toEqual(['src']);
  });

  it('readInsideClone rejects traversal, absolute paths and outside symlinks; reads normal files', async () => {
    await put('secret.txt', 'TOP-SECRET', outside);
    await put('ok.txt', 'fine');
    await symlink(join(outside, 'secret.txt'), join(root, 'sneaky.txt'));
    expect(await readInsideClone(root, '../x')).toBeNull();
    expect(await readInsideClone(root, join(outside, 'secret.txt'))).toBeNull();
    expect(await readInsideClone(root, 'sneaky.txt')).toBeNull();
    expect(await readInsideClone(root, 'missing.txt')).toBeNull();
    expect(await readInsideClone(root, 'ok.txt')).toBe('fine');
  });
});

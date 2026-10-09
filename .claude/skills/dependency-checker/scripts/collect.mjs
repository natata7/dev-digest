#!/usr/bin/env node
// Deterministic data collector for the dependency-checker skill.
// Usage: node collect.mjs [repoRoot]   → JSON on stdout. No network, no installs.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const SKIP = new Set(['node_modules', '.next', '.git', 'dist', '.claude', 'docs']);

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

// own size of a dir, excluding nested node_modules (pnpm/npm layouts differ)
function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'node_modules') stack.push(p); }
      else if (e.isFile()) { try { total += fs.statSync(p).size; } catch {} }
    }
  }
  return total;
}

// package dirs: root + first-level dirs with a package.json
const pkgDirs = [root, ...fs.readdirSync(root, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith('.'))
  .map((e) => path.join(root, e.name))]
  .filter((d) => fs.existsSync(path.join(d, 'package.json')));

const packages = pkgDirs.map((dir) => {
  const pj = readJson(path.join(dir, 'package.json'));
  const lock = ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'].find((l) => fs.existsSync(path.join(dir, l))) ?? null;
  const installed = fs.existsSync(path.join(dir, 'node_modules'));
  const deps = [];
  for (const [kind, key] of [['prod', 'dependencies'], ['dev', 'devDependencies'], ['optional', 'optionalDependencies'], ['peer', 'peerDependencies']]) {
    for (const [name, range] of Object.entries(pj[key] ?? {})) {
      let size = null, version = null, license = null, deepDeps = null;
      const nm = path.join(dir, 'node_modules', name);
      if (fs.existsSync(nm)) {
        const real = fs.realpathSync(nm);
        const dj = readJson(path.join(real, 'package.json'));
        size = dirSize(real);
        version = dj?.version ?? null;
        license = typeof dj?.license === 'string' ? dj.license : null;
        deepDeps = Object.keys(dj?.dependencies ?? {}).length;
      }
      deps.push({ name, kind, range, version, size_bytes: size, license, own_deps: deepDeps });
    }
  }
  // internal edges: tsconfig "paths" targets that leave the package dir
  const internal = new Set();
  try {
    const ts = fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    for (const m of ts.matchAll(/"(@devdigest\/[^"*]+)"\s*:\s*\[\s*"([^"]+)"/g)) {
      const target = path.resolve(dir, m[2]);
      const owner = pkgDirs.find((p) => p !== dir && p !== root && target.startsWith(p + path.sep));
      const rel = path.relative(root, target);
      internal.add(`${m[1]} -> ${path.dirname(rel).replace(/\/src\/(index\.ts)?$/, '')}${owner ? ` (in ${path.basename(owner)})` : ''}`);
    }
  } catch {}
  return {
    name: pj.name ?? path.basename(dir), dir: path.relative(root, dir) || '.',
    manager: lock === 'package-lock.json' ? 'npm' : lock === 'yarn.lock' ? 'yarn' : lock ? 'pnpm' : 'unknown',
    lockfile: lock, installed, internal_links: [...internal],
    deps: deps.sort((a, b) => (b.size_bytes ?? -1) - (a.size_bytes ?? -1)),
  };
});

// same dep declared in several packages (version drift candidates)
const byName = {};
for (const p of packages) for (const d of p.deps) (byName[d.name] ??= []).push({ pkg: p.dir, range: d.range, version: d.version });
const shared = Object.fromEntries(Object.entries(byName).filter(([, v]) => v.length > 1));

console.log(JSON.stringify({ root, generated: new Date().toISOString(), packages, shared }, null, 2));

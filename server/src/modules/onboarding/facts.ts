import { readdir } from 'node:fs/promises';
import { EXCLUDED_DIRS } from '../repo-intel/constants.js';
import { readInsideClone } from '../_shared/clone-fs.js';
import {
  DEPS_PER_MANIFEST_MAX,
  ENV_NAME_RE,
  ENV_TEMPLATES,
  NESTED_MANIFESTS_MAX,
  PRESENCE_MANIFESTS,
  README_MAX,
  README_RE,
  SCRIPTS_MAX,
  SCRIPT_CMD_MAX,
  STRUCTURE_MAX,
  WALK_MAX_DEPTH,
  WALK_VISIT_CAP,
} from './constants.js';
import type { CloneFacts, ManifestFact, ScriptFact } from './helpers.js';

const EXCLUDED = new Set<string>(EXCLUDED_DIRS);
const asc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface Walk {
  rootFiles: string[];
  files: string[]; // repo-relative paths of files at dir depth <= WALK_MAX_DEPTH
  dirCounts: Map<string, number>; // depth 1-2 dir -> recursive file count
  truncated: boolean;
}

/** Bounded walk. Symlinks are never followed; excluded dirs are skipped. */
async function walkClone(root: string): Promise<Walk> {
  const w: Walk = { rootFiles: [], files: [], dirCounts: new Map(), truncated: false };
  let visited = 0;

  async function visit(rel: string, depth: number, d1: string | null, d2: string | null) {
    let entries;
    try {
      entries = await readdir(rel ? `${root}/${rel}` : root, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => asc(a.name, b.name));
    for (const e of entries) {
      if (visited >= WALK_VISIT_CAP) { w.truncated = true; return; }
      visited++;
      if (e.isSymbolicLink()) continue; // ponytail: symlinks skipped, never followed
      const path = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (EXCLUDED.has(e.name)) continue;
        await visit(
          path,
          depth + 1,
          depth === 0 ? path : d1,
          depth === 1 ? path : d2,
        );
      } else if (e.isFile()) {
        if (depth === 0) w.rootFiles.push(e.name);
        if (depth <= WALK_MAX_DEPTH) w.files.push(path);
        for (const d of [d1, d2]) if (d) w.dirCounts.set(d, (w.dirCounts.get(d) ?? 0) + 1);
      }
    }
  }
  await visit('', 0, null, null);
  return w;
}

async function readManifest(root: string, path: string): Promise<ManifestFact> {
  const text = await readInsideClone(root, path);
  const base: ManifestFact = { path, name: null, dependencies: [], scripts: [], parsed: false };
  if (!text) return base;
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const keys = (v: unknown): string[] =>
      v && typeof v === 'object' ? Object.keys(v as object) : [];
    const deps = [...new Set([...keys(j.dependencies), ...keys(j.engines)])]
      .sort(asc)
      .slice(0, DEPS_PER_MANIFEST_MAX);
    const scripts: ScriptFact[] = [];
    if (j.scripts && typeof j.scripts === 'object') {
      for (const [name, cmd] of Object.entries(j.scripts as Record<string, unknown>)) {
        if (typeof cmd === 'string') {
          scripts.push({ manifest: path, name, command: cmd.slice(0, SCRIPT_CMD_MAX) });
        }
      }
    }
    return {
      path,
      name: typeof j.name === 'string' ? j.name : null,
      dependencies: deps,
      scripts,
      parsed: true,
    };
  } catch {
    return base; // bad JSON → listed, no deps/scripts
  }
}

/** Deterministic facts from the clone on disk. Every read goes through readInsideClone. */
export async function collectCloneFacts(root: string): Promise<CloneFacts> {
  const w = await walkClone(root);
  const dirDepth = (p: string): number => p.split('/').length - 1;

  const pkgPaths = w.files.filter((f) => f.split('/').pop() === 'package.json').sort(asc);
  const rootPkg = pkgPaths.filter((p) => p === 'package.json');
  const nested = pkgPaths.filter((p) => p !== 'package.json').slice(0, NESTED_MANIFESTS_MAX);
  const manifests = await Promise.all([...rootPkg, ...nested].map((p) => readManifest(root, p)));

  const presence = w.files
    .filter((f) => (PRESENCE_MANIFESTS as readonly string[]).includes(f.split('/').pop()!))
    .filter((f) => dirDepth(f) <= WALK_MAX_DEPTH)
    .sort(asc);

  const allScripts = manifests.flatMap((m) => m.scripts); // root first, then path ASC
  const dirs = [...w.dirCounts.entries()]
    .map(([path, files]) => ({ path, files }))
    .sort((a, b) => b.files - a.files || asc(a.path, b.path));

  const envFiles: CloneFacts['env'] = [];
  for (const f of ENV_TEMPLATES) {
    if (!w.rootFiles.includes(f)) continue;
    const text = await readInsideClone(root, f);
    if (!text) continue;
    const names: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      const m = ENV_NAME_RE.exec(line);
      if (m && !names.includes(m[1]!)) names.push(m[1]!); // names only, values never kept
    }
    envFiles.push({ file: f, names });
  }

  const readmeName = w.rootFiles.filter((n) => README_RE.test(n)).sort(asc)[0];
  const readmeText = readmeName ? await readInsideClone(root, readmeName, README_MAX) : null;

  return {
    manifests,
    presence,
    scripts: allScripts.slice(0, SCRIPTS_MAX),
    scriptsTotal: allScripts.length,
    structure: dirs.slice(0, STRUCTURE_MAX),
    structureTotal: dirs.length,
    env: envFiles,
    readme: readmeText && readmeName ? { path: readmeName, excerpt: readmeText } : null,
    walkTruncated: w.truncated,
  };
}

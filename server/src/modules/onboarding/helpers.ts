/** Pure onboarding rules: no fs / DB / LLM imports. */
import type {
  OnboardingCoverage,
  OnboardingCoverageCount,
  OnboardingFirstTask,
  OnboardingRunStep,
  OnboardingLlmReason,
  OnboardingReadingItem,
  OnboardingReason,
  OnboardingSection,
  OnboardingRankingBasis,
} from '@devdigest/shared';
import { wrapUntrusted } from '../../platform/prompt.js';
import { ConfigError } from '../../platform/errors.js';
import { TimeoutError } from '../../platform/resilience.js';
import type { EndpointFactRow, IndexState, RankedFileRow } from '../repo-intel/types.js';
import {
  BODY_MAX,
  CHAINS_MAX,
  FACTS_TOKEN_BUDGET,
  FIRST_TASKS_MAX,
  NOTE_MAX,
  READING_PATH_N,
  ROUTES_MAX,
  RUN_STEPS_MAX,
  TASK_TITLE_MAX,
  TITLE_MAX,
  UNAVAILABLE_PREFIX,
  WHY_MAX,
  type OnboardingLlmOutput,
} from './constants.js';

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

// ---- types -----------------------------------------------------------------

export interface ScriptFact { manifest: string; name: string; command: string }
export interface ManifestFact {
  path: string;
  name: string | null;
  dependencies: string[];
  scripts: ScriptFact[];
  parsed: boolean;
}
export interface CloneFacts {
  manifests: ManifestFact[];
  presence: string[];
  scripts: ScriptFact[];
  scriptsTotal: number;
  structure: { path: string; files: number }[];
  structureTotal: number;
  env: { file: string; names: string[] }[];
  readme: { path: string; excerpt: string } | null;
  walkTruncated: boolean;
  packageManager: PackageManager;
}
export interface IntelFacts {
  state: IndexState;
  ranked: RankedFileRow[];
  endpoints: EndpointFactRow[];
  chains: string[][];
}
export type IndexStatusLabel = OnboardingCoverage['index_status'];
export interface Facts {
  clone: CloneFacts;
  indexStatus: IndexStatusLabel;
  readingPath: OnboardingReadingItem[];
  rankingBasis: OnboardingRankingBasis;
  routes: EndpointFactRow[];
  chains: string[][];
  allowedPaths: Set<string>;
  coverage: OnboardingCoverage;
}

// ---- small utils -----------------------------------------------------------

const asc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const count = (shown: number, total: number): OnboardingCoverageCount => ({
  shown,
  total,
  truncated: total > shown,
});
const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const usable = (s: IndexStatusLabel): boolean => s === 'full' || s === 'partial';
/** Inline code span that survives backticks in the content. */
const code = (s: string): string => (s.includes('`') ? `\`\` ${s} \`\`` : `\`${s}\``);
/** isJunkPath (repo-intel) needs a leading slash for dir patterns; root-level dirs slip through. */
const ROOT_JUNK_RE = /^(tests?|__tests__|__mocks__|__fixtures__|migrations)\//;

// ---- index state -----------------------------------------------------------

export function reasonForIndex(
  flagOn: boolean,
  state: IndexState,
): { llm: boolean; reason: OnboardingReason | null; indexStatus: IndexStatusLabel } {
  if (!flagOn) return { llm: false, reason: 'flag_off', indexStatus: 'none' };
  if (state.status === 'degraded') {
    const synthesised = state.reason === 'no_data' || state.degradedReason === 'no_data';
    return synthesised
      ? { llm: false, reason: 'no_index', indexStatus: 'none' }
      : { llm: false, reason: 'index_degraded', indexStatus: 'degraded' };
  }
  if (state.status === 'failed') return { llm: false, reason: 'index_failed', indexStatus: 'failed' };
  if (state.status === 'partial') return { llm: true, reason: 'index_partial', indexStatus: 'partial' };
  return { llm: true, reason: null, indexStatus: 'full' };
}

// ---- facts -----------------------------------------------------------------

export function buildFacts(clone: CloneFacts, intel: IntelFacts | null): Facts {
  const indexStatus = intel ? reasonForIndex(true, intel.state).indexStatus : 'none';
  const use = intel && usable(indexStatus) ? intel : null;

  const scoreOf = new Map<string, number>();
  let eligible: OnboardingReadingItem[] = [];
  let basis: OnboardingRankingBasis = 'pagerank';
  if (use) {
    for (const r of use.ranked) scoreOf.set(r.path, r.pagerank * (1 + clamp01(r.hotness)));
    const rows = use.ranked.filter((r) => !r.junk && !ROOT_JUNK_RE.test(r.path));
    if (rows.some((r) => r.hotness > 0)) basis = 'pagerank_hotness';
    eligible = rows
      .map((r) => ({ path: r.path, score: scoreOf.get(r.path)!, why: null }))
      .sort((a, b) => b.score - a.score || asc(a.path, b.path));
  }
  const readingPath = eligible.slice(0, READING_PATH_N);

  const allRoutes = use
    ? [...use.endpoints].sort(
        (a, b) =>
          (scoreOf.get(b.file) ?? -1) - (scoreOf.get(a.file) ?? -1) ||
          asc(a.endpoint, b.endpoint) ||
          asc(a.file, b.file),
      )
    : [];
  const routes = allRoutes.slice(0, ROUTES_MAX);
  const chains = use ? use.chains.slice(0, CHAINS_MAX) : [];

  const allowed = new Set<string>(use ? use.ranked.map((r) => r.path) : []);
  for (const m of clone.manifests) allowed.add(m.path);
  for (const p of clone.presence) allowed.add(p);
  for (const s of clone.structure) allowed.add(s.path);
  for (const e of clone.env) allowed.add(e.file);
  if (clone.readme) allowed.add(clone.readme.path);

  return {
    clone,
    indexStatus,
    readingPath,
    rankingBasis: basis,
    routes,
    chains,
    allowedPaths: allowed,
    coverage: {
      index_status: indexStatus,
      files_indexed: intel?.state.filesIndexed ?? 0,
      files_skipped: intel?.state.filesSkipped ?? 0,
      routes: count(routes.length, allRoutes.length),
      scripts: count(clone.scripts.length, clone.scriptsTotal),
      structure: count(clone.structure.length, clone.structureTotal),
      reading_path: count(readingPath.length, eligible.length),
      critical_paths: count(chains.length, chains.length),
    },
  };
}

// ---- package manager / run steps / first tasks -----------------------------

/** AC-8 fixed precedence over root files; no lockfile -> npm (E29). */
export function detectPackageManager(rootFiles: string[]): PackageManager {
  if (rootFiles.includes('pnpm-lock.yaml')) return 'pnpm';
  if (rootFiles.includes('yarn.lock')) return 'yarn';
  if (rootFiles.includes('bun.lockb') || rootFiles.includes('bun.lock')) return 'bun';
  return 'npm';
}

const rootScripts = (f: Facts): ScriptFact[] => f.clone.scripts.filter((s) => s.manifest === 'package.json');
const oneLine = (s: string, max: number): string => s.replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, max);

export function buildSkeletonRunSteps(f: Facts): OnboardingRunStep[] {
  const pm = f.clone.packageManager;
  return rootScripts(f)
    .slice(0, RUN_STEPS_MAX)
    .map((s) => ({ command: `${pm} run ${s.name}`, note: null, source: 'facts' as const }));
}

export function buildSkeletonFirstTasks(f: Facts): OnboardingFirstTask[] {
  const tasks: OnboardingFirstTask[] = [];
  if (rootScripts(f).some((s) => s.name === 'test')) tasks.push({ title: 'Run the test script', path: 'package.json' });
  if (f.readingPath[0]) tasks.push({ title: 'Read the first reading-path file', path: f.readingPath[0].path });
  if (f.routes[0]) tasks.push({ title: 'Trace the first route', path: f.routes[0].file });
  return tasks.filter((t) => f.allowedPaths.has(t.path)).slice(0, FIRST_TASKS_MAX);
}

/** AC-41: a command survives only if it is exactly a collected script command or `<pm> run <root script>`. */
export function validateRunSteps(
  f: Facts,
  steps: OnboardingLlmOutput['run_steps'],
): { kept: OnboardingRunStep[]; dropped: number } {
  const input = steps ?? [];
  const pm = f.clone.packageManager;
  const ok = new Set<string>([
    ...f.clone.scripts.map((s) => s.command),
    ...rootScripts(f).map((s) => `${pm} run ${s.name}`),
  ]);
  const kept: OnboardingRunStep[] = [];
  for (const st of input) {
    const command = st.command.trim();
    if (kept.length >= RUN_STEPS_MAX || !ok.has(command)) continue;
    kept.push({ command, note: oneLine(st.note ?? '', NOTE_MAX) || null, source: 'llm' });
  }
  return { kept, dropped: input.length - kept.length };
}

/** AC-42: path must be an allowed file or structure dir (trailing `/` tolerated). */
export function validateFirstTasks(
  f: Facts,
  tasks: OnboardingLlmOutput['first_tasks'],
): { kept: OnboardingFirstTask[]; dropped: number } {
  const input = tasks ?? [];
  const kept: OnboardingFirstTask[] = [];
  for (const t of input) {
    const path = t.path.trim().replace(/^\.\//, '');
    const title = oneLine(t.title, TASK_TITLE_MAX);
    const known = f.allowedPaths.has(path) || f.allowedPaths.has(path.replace(/\/+$/, ''));
    if (kept.length >= FIRST_TASKS_MAX || !title || !known) continue;
    kept.push({ title, path });
  }
  return { kept, dropped: input.length - kept.length };
}

// ---- skeleton --------------------------------------------------------------

const link = (path: string) => ({ label: path, path });

export function buildSkeleton(f: Facts): OnboardingSection[] {
  const c = f.clone;
  const sec = (
    kind: OnboardingSection['kind'],
    title: string,
    body: string,
    paths: string[],
  ): OnboardingSection => ({
    kind,
    title,
    body,
    diagram: null,
    links: [...new Set(paths)].map(link),
    source: 'facts',
  });

  // architecture = stack + structure
  const stack: string[] = [];
  for (const m of c.manifests) {
    const deps = m.dependencies.length ? `: ${m.dependencies.join(', ')}` : '';
    stack.push(`- ${code(m.path)}${m.name ? ` (${m.name})` : ''}${deps}`);
  }
  for (const p of c.presence) stack.push(`- ${code(p)} detected`);
  const arch =
    `### Stack\n${stack.length ? stack.join('\n') : 'No manifests detected.'}\n\n` +
    `### Structure\n${
      c.structure.length
        ? c.structure.map((s) => `- ${code(s.path)} — ${s.files} files`).join('\n')
        : 'No directories found.'
    }`;

  const unavailable = `${UNAVAILABLE_PREFIX} ${f.indexStatus}.`;
  const chainText = f.chains.length
    ? f.chains.map((ch) => `- ${ch.map(code).join(' → ')}`).join('\n')
    : unavailable;

  const run: string[] = [];
  if (!rootScripts(f).length) {
    run.push(
      `No root scripts detected.${
        c.presence.length || c.manifests.length
          ? ` Detected manifests: ${[...c.manifests.map((m) => m.path), ...c.presence].map(code).join(', ')}.`
          : ''
      }`,
    );
  }
  const envNames = [...new Set(c.env.flatMap((e) => e.names))];
  if (envNames.length) run.push(`### Environment variables\n${envNames.map((n) => `- ${code(n)}`).join('\n')}`);
  if (c.readme) run.push(`See ${code(c.readme.path)} for details.`);

  const reading = f.readingPath.length ? 'Read these files in this order.' : unavailable;

  const taskCount = buildSkeletonFirstTasks(f).length;
  const first = taskCount
    ? 'Start with these tasks.'
    : 'No concrete tasks could be derived from the available facts.';

  return [
    sec('architecture', 'Architecture', arch, c.manifests.map((m) => m.path)),
    sec('critical_paths', 'Critical paths', chainText, f.chains.flat()),
    sec('local_run', 'Run it locally', run.join('\n\n') || 'Run these steps from the repository root.', [
      ...(c.readme ? [c.readme.path] : []),
      ...c.env.map((e) => e.file),
    ]),
    sec('reading_order', 'Reading order', reading, f.readingPath.map((r) => r.path)),
    sec('first_tasks', 'First tasks', first, buildSkeletonFirstTasks(f).map((t) => t.path)),
  ];
}

// ---- prompt serialization --------------------------------------------------

const tokens = (s: string): number => Math.ceil(s.length / 4);

export function serializeFactsForPrompt(f: Facts): { text: string; dropped: string[] } {
  const c = f.clone;
  const structure = c.structure.map((s) => `${s.path} (${s.files} files)`);
  const routes = f.routes.map((r) => `${r.endpoint}  [${r.file}]`);
  const readme = c.readme ? c.readme.excerpt.split('\n') : [];
  const scripts = c.scripts.map((s) => `${s.manifest}: ${s.name} = ${s.command}`);
  const stack = [
    `package_manager: ${c.packageManager}`,
    ...c.manifests.map((m) => `${m.path}${m.name ? ` (${m.name})` : ''}: ${m.dependencies.join(', ')}`),
    ...c.presence.map((p) => `${p} present`),
  ];
  const env = c.env.map((e) => `${e.file}: ${e.names.join(', ')}`);
  const reading = f.readingPath.map((r) => `${r.path} (score ${r.score.toFixed(4)})`);
  const chains = f.chains.map((ch) => ch.join(' -> '));

  const state = { structure, routes, readme, scripts };
  const render = (): string =>
    [
      ['stack', stack],
      ['structure', state.structure],
      ['routes', state.routes],
      ['readme', state.readme],
      ['scripts', state.scripts],
      ['env_names', env],
      ['reading_path', reading],
      ['critical_paths', chains],
    ]
      .map(([label, lines]) => wrapUntrusted(label as string, (lines as string[]).join('\n')))
      .join('\n\n');

  const dropped: string[] = [];
  let text = render();
  for (const key of ['structure', 'routes', 'readme', 'scripts'] as const) {
    while (tokens(text) > FACTS_TOKEN_BUDGET && state[key].length) {
      state[key] = state[key].slice(0, -1);
      if (!dropped.includes(key)) dropped.push(key);
      text = render();
    }
  }
  return { text, dropped };
}

// ---- merge LLM output ------------------------------------------------------

export function filterLinks(sections: OnboardingSection[], allowed: Set<string>): OnboardingSection[] {
  return sections.map((s) => ({
    ...s,
    links: s.links.filter((l) => allowed.has(l.path.replace(/^\.\//, ''))),
  }));
}

const sanitizeWhy = (s: string): string | null => {
  const t = s.replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, WHY_MAX);
  return t || null;
};

export function mergeLlmOutput(
  facts: Facts,
  skeleton: OnboardingSection[],
  out: OnboardingLlmOutput,
): {
  sections: OnboardingSection[];
  reading_path: OnboardingReadingItem[];
  run_steps: OnboardingRunStep[];
  first_tasks: OnboardingFirstTask[];
  dropped: { run_steps: number; first_tasks: number };
} {
  const byKind = new Map<string, OnboardingLlmOutput['sections']>();
  for (const s of out.sections) byKind.set(s.kind, [...(byKind.get(s.kind) ?? []), s]);

  const sections = skeleton.map((sk): OnboardingSection => {
    const cands = byKind.get(sk.kind);
    const s = cands?.length === 1 ? cands[0]! : null; // duplicated kind → invalid
    if (!s) return sk;
    const title = s.title.trim();
    const body = s.body.trim();
    if (!title || !body || title.length > TITLE_MAX || body.length > BODY_MAX) return sk;
    return {
      kind: sk.kind,
      title,
      body,
      diagram: s.diagram?.trim() ? s.diagram : null,
      links: s.links,
      source: 'llm',
    };
  });

  const why = new Map<string, string>();
  for (const w of out.reading_why) if (!why.has(w.path)) why.set(w.path, w.why);
  const reading_path = facts.readingPath.map((r) => ({
    ...r,
    why: why.has(r.path) ? sanitizeWhy(why.get(r.path)!) : null,
  }));

  const rs = validateRunSteps(facts, out.run_steps);
  const ft = validateFirstTasks(facts, out.first_tasks);
  return {
    sections: filterLinks(sections, facts.allowedPaths),
    reading_path,
    run_steps: rs.kept.length ? rs.kept : buildSkeletonRunSteps(facts),
    first_tasks: ft.kept.length ? ft.kept : buildSkeletonFirstTasks(facts),
    dropped: { run_steps: rs.dropped, first_tasks: ft.dropped },
  };
}

// ---- error classification --------------------------------------------------

export function classifyLlmError(err: unknown): OnboardingLlmReason {
  if (err instanceof ConfigError) return 'llm_not_configured';
  if (err instanceof TimeoutError) return 'llm_timeout';
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout|timed out/i.test(name) || /timeout|timed out/i.test(msg)) return 'llm_timeout';
  if (name === 'ZodError' || /schema validation|ZodError/i.test(msg)) return 'llm_invalid_output';
  return 'llm_failed';
}

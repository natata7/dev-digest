/** Pure PR Brief rules: no fs / DB / LLM / Fastify imports. */
import type {
  BlastRadius,
  Intent,
  PrBriefDraft,
  PrBriefMissingInput,
  Risk,
  ReviewFocusItem,
  SmartDiffRole,
} from '@devdigest/shared';
import { wrapUntrusted } from '../../platform/prompt.js';
import { approxTokens } from '../context/helpers.js';
import { classifyFile } from '../reviews/smart-diff/classify.js';
import {
  BLAST_CALLERS_KEEP,
  BLAST_CALLERS_MAX,
  CAP,
  DIFF_ROWS_KEEP,
  DIFF_ROW_RANGES_MAX,
  INPUT_TOKEN_BUDGET,
  MAX_FOCUS,
  MAX_RISKS,
  SPEC_DOC_HEAD_TOKENS,
} from './constants.js';

export interface DiffFileFact {
  path: string;
  additions: number;
  deletions: number;
  role: SmartDiffRole;
  ranges: [number, number][];
}

/** Inclusive [start, end] new-side line ranges. */
export type LineRange = [number, number];
export interface Allowlist {
  paths: Set<string>;
  /** A13: ranges, not expanded line arrays. */
  anchors: Map<string, LineRange[]>;
}

/** New-side hunk ranges from a unified patch. @@ context text is never kept. */
export function hunkRanges(patch: string | null): [number, number][] {
  if (!patch) return [];
  const out: [number, number][] = [];
  for (const m of patch.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count > 0) out.push([start, start + count - 1]);
  }
  return out;
}

export function toDiffFacts(
  files: { path: string; additions: number; deletions: number; patch: string | null }[],
): DiffFileFact[] {
  return files.map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
    role: classifyFile(f.path),
    ranges: hunkRanges(f.patch),
  }));
}

/** D7: exact-string allowlist = diff paths ∪ changed-symbol files ∪ caller files. */
export function buildAllowlist(diff: DiffFileFact[], blast: BlastRadius | null): Allowlist {
  const paths = new Set<string>();
  const anchors = new Map<string, LineRange[]>();
  for (const f of diff) {
    paths.add(f.path);
    if (f.ranges.length) anchors.set(f.path, f.ranges);
  }
  if (blast) {
    for (const s of blast.changed_symbols) paths.add(s.file);
    for (const d of blast.downstream) {
      for (const c of d.callers) {
        paths.add(c.file);
        if (diff.some((f) => f.path === c.file)) continue; // diff files anchor on hunks only
        const list = anchors.get(c.file) ?? [];
        list.push([c.line, c.line]);
        anchors.set(c.file, list);
      }
    }
  }
  return { paths, anchors };
}

/** Keep a valid line, else the nearest anchored line (ties → lower), none → 1. */
export function snapLine(line: number, anchors: LineRange[] | undefined): number {
  if (!anchors?.length) return 1;
  let best = 0;
  let bestDist = Infinity;
  for (const [s, e] of anchors) {
    const cand = Math.min(Math.max(line, s), e);
    const dist = Math.abs(cand - line);
    if (dist < bestDist || (dist === bestDist && cand < best)) {
      best = cand;
      bestDist = dist;
    }
  }
  return best;
}

/** AC-11..15: drop ungrounded refs, snap focus lines, cap AFTER filtering (A10). */
export function groundDraft(
  draft: PrBriefDraft,
  allow: Allowlist,
): {
  summary: string;
  risks: Risk[];
  review_focus: ReviewFocusItem[];
  dropped: { risks: number; fileRefs: number; focus: number; snapped: number };
} {
  const dropped = { risks: 0, fileRefs: 0, focus: 0, snapped: 0 };
  const risks: Risk[] = [];
  for (const r of draft.risks) {
    const refs = r.file_refs.filter((p) => allow.paths.has(p));
    dropped.fileRefs += r.file_refs.length - refs.length;
    if (refs.length === 0) dropped.risks++;
    else risks.push({ ...r, file_refs: refs });
  }
  const focus: ReviewFocusItem[] = [];
  for (const f of draft.review_focus) {
    if (!allow.paths.has(f.file)) {
      dropped.focus++;
      continue;
    }
    const line = snapLine(f.line, allow.anchors.get(f.file));
    if (line !== f.line) dropped.snapped++;
    focus.push({ ...f, line });
  }
  return {
    summary: draft.summary.trim(),
    risks: risks.slice(0, MAX_RISKS),
    review_focus: focus.slice(0, MAX_FOCUS),
    dropped,
  };
}

/** D1: attached docs by usage count (agents listing the path) DESC, path ASC. */
export function orderSpecPaths(perAgent: string[][]): string[] {
  const count = new Map<string, number>();
  for (const paths of perAgent) for (const p of new Set(paths)) count.set(p, (count.get(p) ?? 0) + 1);
  return [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)! || (a < b ? -1 : a > b ? 1 : 0));
}

export function missingInputs(i: {
  intent: unknown;
  blast: unknown;
  specDocs: number;
  description: string | null;
}): PrBriefMissingInput[] {
  const out: PrBriefMissingInput[] = [];
  if (!i.intent) out.push('intent');
  if (!i.blast) out.push('blast');
  if (i.specDocs === 0) out.push('specs');
  if (!i.description?.trim()) out.push('description');
  return out;
}

/** AC-34: a degraded read is unusable unless it is only `index_partial`. */
export function blastUsable(b: BlastRadius): { use: boolean; partial: boolean } {
  if (!b.degraded) return { use: true, partial: false };
  return b.reason === 'index_partial' ? { use: true, partial: true } : { use: false, partial: false };
}

const clip = (text: string, tokens: number): string => (tokens <= 0 ? '' : text.slice(0, tokens * 4));

const fmtRanges = (r: [number, number][]): string => {
  const s = r.slice(0, DIFF_ROW_RANGES_MAX).map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`));
  return s.join(',') + (r.length > DIFF_ROW_RANGES_MAX ? ',…' : '');
};

/**
 * Facts message for the single LLM call. Diff rows are numbers + paths only
 * (AC-27, no patch lines). Per-section caps, then NFR-1 drop order:
 * specs -> description tail -> callers beyond 10 -> low-churn diff rows.
 */
export function buildFactsMessage(
  f: {
    title: string;
    description: string | null;
    intent: Intent | null;
    blast: BlastRadius | null;
    blastPartial: boolean;
    diff: DiffFileFact[];
    specs: { path: string; text: string }[];
    missing: PrBriefMissingInput[];
  },
  systemTokens: number,
): {
  text: string;
  estTokens: number;
  truncated: { specs: boolean; description: boolean; callers: boolean; diffRows: number };
} {
  const sorted = [...f.diff].sort(
    (a, b) => b.additions + b.deletions - (a.additions + a.deletions) || (a.path < b.path ? -1 : 1),
  );
  const rows = sorted.map((d) => `${d.path} +${d.additions} -${d.deletions} ${d.role} ${fmtRanges(d.ranges)}`.trimEnd());
  const callers = (f.blast?.downstream ?? []).flatMap((d) => d.callers.map((c) => `${c.file}:${c.line} ${c.name}`));

  // Diff rows that fit CAP.diff (top DIFF_ROWS_KEEP always kept).
  let diffRows = rows.length;
  {
    let used = 0;
    let n = 0;
    for (const r of rows) {
      used += approxTokens(r) + 1;
      if (used > CAP.diff && n >= DIFF_ROWS_KEEP) break;
      n++;
    }
    diffRows = n;
  }
  const state = { specs: true, descTokens: CAP.description as number, callerLimit: BLAST_CALLERS_MAX, diffRows };

  const render = () => {
    const parts: string[] = [];
    if (f.missing.length) parts.push(`Missing inputs (not available, do not guess them): ${f.missing.join(', ')}`);
    parts.push(`Title: ${f.title}`);
    if (f.intent) {
      const i = f.intent;
      const t = `Intent: ${i.intent}\nIn scope: ${i.in_scope.join('; ')}\nOut of scope: ${i.out_of_scope.join('; ')}`;
      parts.push(wrapUntrusted('intent', clip(t, CAP.intent)));
    }
    let callersCut = false;
    if (f.blast) {
      const shown = callers.slice(0, state.callerLimit);
      callersCut = shown.length < callers.length;
      let t = `Blast radius: ${f.blast.summary}\nChanged symbols: ${f.blast.changed_symbols.map((s) => `${s.name} (${s.file})`).join(', ')}`;
      if (shown.length) t += `\nCallers:\n${shown.join('\n')}`;
      if (f.blastPartial || callersCut) t += '\nNote: caller list may be incomplete.';
      parts.push(wrapUntrusted('blast-radius', clip(t, CAP.blast)));
    }
    const shownRows = rows.slice(0, state.diffRows);
    const rest = sorted.slice(state.diffRows);
    let t = `Changed files (path +additions -deletions role new-side hunk lines):\n${shownRows.join('\n')}`;
    if (rest.length) {
      const a = rest.reduce((s, d) => s + d.additions, 0);
      const d = rest.reduce((s, x) => s + x.deletions, 0);
      t += `\n+${rest.length} more files (${a} additions, ${d} deletions)`;
    }
    parts.push(wrapUntrusted('diff-files', t));
    if (f.description?.trim() && state.descTokens > 0) {
      parts.push(wrapUntrusted('description', clip(f.description, state.descTokens)));
    }
    let specsCut = false;
    if (state.specs && f.specs.length) {
      let used = 0;
      let shown = 0;
      for (const s of f.specs) {
        const head = clip(s.text, SPEC_DOC_HEAD_TOKENS);
        const t = approxTokens(head);
        if (used + t > CAP.specs) break;
        used += t;
        shown++;
        parts.push(wrapUntrusted('spec', `${s.path}\n${head}`));
      }
      if (shown < f.specs.length) {
        specsCut = true;
        parts.push(`${f.specs.length - shown} more attached docs omitted`);
      }
    }
    const text = parts.join('\n\n');
    return { text, est: systemTokens + approxTokens(text), callersCut, specsCut };
  };

  let r = render();
  const over = () => r.est > INPUT_TOKEN_BUDGET;
  if (over() && state.specs) { state.specs = false; r = render(); }
  while (over() && state.descTokens > 0) {
    state.descTokens = state.descTokens < 50 ? 0 : Math.floor(state.descTokens / 2);
    r = render();
  }
  if (over() && state.callerLimit > BLAST_CALLERS_KEEP) { state.callerLimit = BLAST_CALLERS_KEEP; r = render(); }
  while (over() && state.diffRows > DIFF_ROWS_KEEP) {
    state.diffRows = Math.max(DIFF_ROWS_KEEP, state.diffRows - Math.max(1, Math.ceil(state.diffRows * 0.1)));
    r = render();
  }

  return {
    text: r.text,
    estTokens: r.est,
    truncated: {
      specs: !state.specs && f.specs.length > 0 || r.specsCut,
      description: !!f.description?.trim() && state.descTokens < Math.min(CAP.description, Math.ceil(f.description.length / 4)),
      callers: r.callersCut,
      diffRows: sorted.length - state.diffRows,
    },
  };
}

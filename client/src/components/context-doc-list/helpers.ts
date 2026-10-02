import type { SpecFile } from "@devdigest/shared";

export interface DocRow {
  path: string;
  kind: SpecFile["kind"] | null;
  tokens: number;
  attached: boolean;
  /** Attached but no longer present in the repo's context list. */
  missing: boolean;
}

/** Attached paths first (in attached order, incl. missing ones), then the rest. */
export function buildRows(files: SpecFile[], attached: string[]): DocRow[] {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const head = attached.map((path): DocRow => {
    const f = byPath.get(path);
    return { path, kind: f?.kind ?? null, tokens: f?.tokens ?? 0, attached: true, missing: !f };
  });
  const set = new Set(attached);
  const tail = files
    .filter((f) => !set.has(f.path))
    .map((f): DocRow => ({ path: f.path, kind: f.kind, tokens: f.tokens, attached: false, missing: false }));
  return [...head, ...tail];
}

/** Sum of tokens of attached files that still exist (missing ones are not injected). */
export function sumTokens(files: SpecFile[], attached: string[]): number {
  const set = new Set(attached);
  return files.reduce((n, f) => (set.has(f.path) ? n + f.tokens : n), 0);
}

export function filterRows<T extends { path: string }>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  return needle ? rows.filter((r) => r.path.toLowerCase().includes(needle)) : rows;
}

/** Move `from` to the position of `to` within `paths`. */
export function moveBefore(paths: string[], from: string, to: string): string[] {
  if (from === to || !paths.includes(from) || !paths.includes(to)) return paths;
  const rest = paths.filter((p) => p !== from);
  rest.splice(rest.indexOf(to), 0, from);
  return rest;
}

export function toggle(paths: string[], path: string, on: boolean): string[] {
  return on ? (paths.includes(path) ? paths : [...paths, path]) : paths.filter((p) => p !== path);
}

/** "specs/public-api.md" -> { dir: "specs/", name: "public-api.md" }. */
export function splitPath(path: string): { dir: string; name: string } {
  const i = path.lastIndexOf("/");
  return i < 0 ? { dir: "", name: path } : { dir: path.slice(0, i + 1), name: path.slice(i + 1) };
}

const HEADINGS: Record<string, string> = {
  specs: "## Project specifications",
  docs: "## Project docs",
  insights: "## Project insights",
};

/** Attached paths grouped by kind, as serialized into the prompt (empty groups omitted). */
export function serializeGrouped(files: SpecFile[], attached: string[]): string {
  const kindOf = new Map(files.map((f) => [f.path, f.kind]));
  return (["specs", "docs", "insights"] as const)
    .flatMap((k) => {
      const ps = attached.filter((p) => kindOf.get(p) === k);
      return ps.length ? [HEADINGS[k], ...ps.map((p) => `- ${p}`)] : [];
    })
    .join("\n");
}

import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';
import type { SpecFile } from '@devdigest/shared';

/** ~4 chars per token heuristic. */
export const approxTokens = (text: string): number => Math.ceil(text.length / 4);

/** First path segment named specs|docs|insights wins; null → not a context file. */
export function kindOf(path: string): SpecFile['kind'] | null {
  for (const seg of path.split('/').slice(0, -1)) {
    if (seg === 'specs' || seg === 'docs' || seg === 'insights') return seg;
  }
  return null;
}

/** True when `rel` (relative, no `..`, not absolute) stays lexically inside `root`. */
export function isInsideRoot(root: string, rel: string): boolean {
  if (!rel || rel.includes('\0') || isAbsolute(rel)) return false;
  const full = resolve(root, normalize(rel));
  const r = relative(resolve(root), full);
  return r !== '' && !r.startsWith('..') && !isAbsolute(r) && !r.split(sep).includes('..');
}

/** Tiny glob → RegExp: supports `**`, `*`, `{a,b}`; everything else literal. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (glob.startsWith('**/', i)) { re += '(?:.*/)?'; i += 2; }
    else if (glob.startsWith('**', i)) { re += '.*'; i += 1; }
    else if (c === '*') re += '[^/]*';
    else if (c === '{') re += '(?:';
    else if (c === '}') re += ')';
    else if (c === ',') re += '|'; // ponytail: a literal comma outside braces is not supported
    else re += c.replace(/[.+?^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

export const matchesGlob = (glob: string, path: string): boolean => globToRegExp(glob).test(path);

/** Directories never descended into while discovering context files. */
export const skipDir = (name: string): boolean => name.startsWith('.') || name === 'node_modules';

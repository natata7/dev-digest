import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';

/** True when `rel` (relative, no `..`, not absolute) stays lexically inside `root`. */
export function isInsideRoot(root: string, rel: string): boolean {
  if (!rel || rel.includes('\0') || isAbsolute(rel)) return false;
  const full = resolve(root, normalize(rel));
  const r = relative(resolve(root), full);
  return r !== '' && !r.startsWith('..') && !isAbsolute(r) && !r.split(sep).includes('..');
}

const within = (root: string, p: string): boolean => {
  const r = relative(root, p);
  return r !== '' && !r.startsWith('..') && !isAbsolute(r);
};

/**
 * Read a regular file inside a clone. Lexical check + realpath check (a symlink
 * resolving outside the clone is rejected). Returns null on any violation,
 * missing file, read error, or empty/whitespace-only content. Truncates to
 * `maxChars` when given.
 */
export async function readInsideClone(
  root: string,
  rel: string,
  maxChars?: number,
): Promise<string | null> {
  if (!isInsideRoot(root, rel)) return null;
  try {
    const realRoot = await realpath(root);
    const real = await realpath(resolve(root, normalize(rel)));
    if (!within(realRoot, real)) return null;
    if (!(await stat(real)).isFile()) return null;
    const text = await readFile(real, 'utf8');
    if (!text.trim()) return null;
    return maxChars !== undefined && text.length > maxChars ? text.slice(0, maxChars) : text;
  } catch {
    return null;
  }
}

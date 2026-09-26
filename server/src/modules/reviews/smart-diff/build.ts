import type { SmartDiff, SmartDiffFile, SmartDiffGroup } from '@devdigest/shared';
import { classifyFile } from './classify.js';
import { ROLE_ORDER } from './constants.js';

/** Minimal local shape — deliberately NOT a Drizzle row type, so this stays
 *  callable from a unit test (or a future non-DB caller) with a plain array. */
export interface SmartDiffInputFile {
  path: string;
  additions: number;
  deletions: number;
}

/**
 * Bucket PR files by role and attach the (sorted, de-duped) finding line
 * numbers for each path. Pure — no DB/Fastify access. `split_suggestion`
 * stays minimal per spec: no LLM call, `too_big` always false, no proposed
 * splits — just the total changed-line count.
 */
export function buildSmartDiff(
  files: SmartDiffInputFile[],
  findingLinesByPath: Map<string, number[]>,
): SmartDiff {
  const byRole = new Map<string, SmartDiffFile[]>();
  for (const role of ROLE_ORDER) byRole.set(role, []);

  let totalLines = 0;
  for (const file of files) {
    totalLines += file.additions + file.deletions;
    const role = classifyFile(file.path);
    const lines = [...new Set(findingLinesByPath.get(file.path) ?? [])].sort((a, b) => a - b);
    byRole.get(role)!.push({
      path: file.path,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines: lines,
    });
  }

  const groups: SmartDiffGroup[] = ROLE_ORDER.map((role) => ({
    role,
    files: byRole.get(role) ?? [],
  }));

  return {
    groups,
    split_suggestion: { too_big: false, total_lines: totalLines, proposed_splits: [] },
  };
}

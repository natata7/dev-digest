/* Pure grouping helpers for the DiffTab (Smart Diff). Colocated here — used
   by exactly this one consumer. */
import type { FindingRecord, PrFile, SmartDiff, SmartDiffRole } from "@devdigest/shared";
import { ROLE_ORDER } from "./constants";

export function filesByPath(files: PrFile[]): Map<string, PrFile> {
  return new Map(files.map((f) => [f.path, f]));
}

export interface FileGroup {
  role: SmartDiffRole;
  files: PrFile[];
}

/**
 * Bucket the PR's real `PrFile`s (which carry `.patch`, not on the contract)
 * by the role the server's Smart Diff assigned each path to. Always returns
 * all 5 groups, in ROLE_ORDER, even when empty — unmatched paths (a path the
 * server returned that isn't in `files`) are skipped rather than crashing.
 */
export function groupFiles(smartDiff: SmartDiff | undefined, files: PrFile[]): FileGroup[] {
  if (!smartDiff) return [];
  const byPath = filesByPath(files);
  return ROLE_ORDER.map((role) => {
    const group = smartDiff.groups.find((g) => g.role === role);
    const resolved = (group?.files ?? [])
      .map((f) => byPath.get(f.path))
      .filter((f): f is PrFile => !!f);
    return { role, files: resolved };
  });
}

/** Count of files (not findings) in `files` that have ≥1 finding — AC3. */
export function filesWithFindingsCount(files: PrFile[], findings: FindingRecord[]): number {
  const pathsWithFindings = new Set(findings.map((f) => f.file));
  return files.filter((f) => pathsWithFindings.has(f.path)).length;
}

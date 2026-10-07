import type { Onboarding, Repo } from "@devdigest/shared";
import { repoBlobUrl } from "@/lib/repo-urls";
import { INDEX_REASONS, UNAVAILABLE_PREFIX } from "./constants";

type Section = Onboarding["sections"][number];

export function isIndexReason(reason: Onboarding["reason"]): boolean {
  return reason !== null && INDEX_REASONS.includes(reason);
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function truncatedCategories(cov: Onboarding["coverage"]) {
  return (
    [
      "routes",
      "scripts",
      "structure",
      "reading_path",
      "critical_paths",
    ] as const
  )
    .filter((k) => cov[k].truncated)
    .map((k) => ({ key: k, shown: cov[k].shown, total: cov[k].total }));
}

export const sectionAnchor = (kind: Section["kind"]) => `onb-${kind}`;

/** AC-55 / D26. ponytail: string coupling; add a contract flag if the copy ever changes. */
export function isUnavailable(sec: Section): boolean {
  return sec.source === "facts" && sec.body.startsWith(UNAVAILABLE_PREFIX);
}

/** AC-49: no index → "Generated without an index". */
export function hasIndex(cov: Onboarding["coverage"]): boolean {
  return cov.files_indexed > 0 && cov.index_status !== "none";
}

/** AC-45 / D25 / E24: provider file URL at indexed_sha, or null when Open must not render. */
export function openHref(
  repo: Pick<Repo, "provider" | "full_name"> | undefined,
  indexedSha: string | null,
  path: string,
): string | null {
  if (!repo?.full_name || !indexedSha) return null;
  return repoBlobUrl(repo.provider, repo.full_name, indexedSha, path);
}

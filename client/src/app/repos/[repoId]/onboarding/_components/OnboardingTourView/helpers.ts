import type { Onboarding } from "@devdigest/shared";
import { INDEX_REASONS } from "./constants";

export function isIndexReason(reason: Onboarding["reason"]): boolean {
  return reason !== null && INDEX_REASONS.includes(reason);
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function truncatedCategories(cov: Onboarding["coverage"]) {
  return (["routes", "scripts", "structure", "reading_path", "critical_paths"] as const)
    .filter((k) => cov[k].truncated)
    .map((k) => ({ key: k, shown: cov[k].shown, total: cov[k].total }));
}

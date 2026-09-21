import type { PrIntentRecord } from "@devdigest/shared";

/** The PR moved since this intent was computed against `headSha` — the
 *  Recompute banner should show. `null` head_sha (never computed against a
 *  known commit) never counts as stale on its own. */
export function isIntentStale(intent: PrIntentRecord, headSha: string | null | undefined): boolean {
  if (!headSha || !intent.head_sha) return false;
  return intent.head_sha !== headSha;
}

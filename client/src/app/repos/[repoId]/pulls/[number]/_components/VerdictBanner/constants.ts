import type { IconName } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";

/** Per-verdict visual meta. `labelKey` resolves under the `verdict` namespace. */
export const VERDICT_META: Record<
  Verdict,
  { c: string; bg: string; icon: IconName; labelKey: string }
> = {
  request_changes: {
    c: "var(--crit)",
    bg: "var(--crit-bg)",
    icon: "XCircle",
    labelKey: "requestChanges",
  },
  approve: { c: "var(--ok)", bg: "var(--ok-bg)", icon: "CheckCircle", labelKey: "approve" },
  comment: { c: "var(--info)", bg: "var(--info-bg)", icon: "MessageSquare", labelKey: "comment" },
};

/** Banner without a verdict (e.g. brief before any completed review). */
export const NEUTRAL_META: { c: string; bg: string; icon: IconName; labelKey: string } = {
  c: "var(--text-secondary)",
  bg: "var(--bg-hover)",
  icon: "Info",
  labelKey: "comment",
};

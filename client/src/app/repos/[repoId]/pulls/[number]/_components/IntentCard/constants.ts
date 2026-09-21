import type { IconName } from "@devdigest/ui";
import type { IntentConfidence, IntentSource } from "@devdigest/shared";

export const CONFIDENCE_COLOR: Record<IntentConfidence, string> = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--text-muted)",
};

export const SOURCE_LABEL: Record<IntentSource["kind"], string> = {
  title: "Title",
  description: "Description",
  linked_issue: "Linked issue",
  spec: "Linked spec",
  files: "Changed files",
};

export const SOURCE_ICON: Record<IntentSource["kind"], IconName> = {
  title: "FileText",
  description: "MessageSquare",
  linked_issue: "GitPullRequest",
  spec: "FileText",
  files: "Layers",
};

import type { RiskSeverity } from "@devdigest/shared";

export const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--danger, #ef4444)",
  medium: "var(--warning, #f59e0b)",
  low: "var(--text-secondary)",
};

export const SEVERITY_ORDER: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };

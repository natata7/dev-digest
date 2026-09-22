import type { CSSProperties } from "react";

/** Co-located styles for ImportSkillModal. */
export const s = {
  footer: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  warning: {
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  markdown: {
    maxHeight: 240,
    overflow: "auto",
    padding: 12,
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
  } satisfies CSSProperties,
  modeRow: { display: "flex", gap: 8 } satisfies CSSProperties,
  urlRow: { display: "flex", gap: 8, alignItems: "flex-end" } satisfies CSSProperties,
  urlInput: { flex: 1 } satisfies CSSProperties,
  scanClean: {
    padding: "8px 12px",
    borderRadius: 8,
    fontSize: 12.5,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  scanSuspicious: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  scanMalicious: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  scanFinding: { marginTop: 4 } satisfies CSSProperties,
  scanDegraded: { fontSize: 12, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
} as const;

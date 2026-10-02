import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 1100 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 18,
    paddingTop: 14,
    borderTop: "1px solid var(--border)",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tokens: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  code: {
    fontSize: "0.95em",
    padding: "1px 5px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;

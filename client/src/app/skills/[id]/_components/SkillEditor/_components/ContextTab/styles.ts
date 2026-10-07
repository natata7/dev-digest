import type { CSSProperties } from "react";

export const s = {
  wrap: { maxWidth: 1100 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  serialize: { marginTop: 24 } satisfies CSSProperties,
  serializeLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    color: "var(--text-muted)",
    marginBottom: 6,
    textTransform: "uppercase",
  } satisfies CSSProperties,
  pre: {
    margin: 0,
    padding: 16,
    fontSize: 13,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg)",
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.7,
  } satisfies CSSProperties,
} as const;

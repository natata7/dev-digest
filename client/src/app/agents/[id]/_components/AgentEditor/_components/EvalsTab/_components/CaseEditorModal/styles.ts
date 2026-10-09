import type { CSSProperties } from "react";

export const s = {
  body: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: 24 } satisfies CSSProperties,
  col: { display: "flex", flexDirection: "column", gap: 14, minWidth: 0 } satisfies CSSProperties,
  label: { fontSize: 13, fontWeight: 600, marginBottom: 6 } satisfies CSSProperties,
  ok: { color: "var(--ok)", fontSize: 12, fontWeight: 600 } satisfies CSSProperties,
  bad: { color: "var(--crit)", fontSize: 12, fontWeight: 600 } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  error: { color: "var(--crit)", fontSize: 13 } satisfies CSSProperties,
} as const;

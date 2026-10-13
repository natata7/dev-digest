import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  back: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--text-secondary)", textDecoration: "none" } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-end", gap: 14 } satisfies CSSProperties,
  h1: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  sub: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  spacer: { flex: 1 } satisfies CSSProperties,
  alert: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    border: "1px solid var(--warn, #e8a33d)",
    background: "var(--warn-bg, rgba(232,163,61,.10))",
    borderRadius: 9,
    fontSize: 14,
  } satisfies CSSProperties,
  tiles: { display: "flex", gap: 14 } satisfies CSSProperties,
  card: { background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 9, padding: 18 } satisfies CSSProperties,
  label: { fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "var(--text-muted)" } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  runsHead: { display: "flex", alignItems: "center", gap: 12, marginBottom: 8 } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: { textAlign: "left", padding: "10px", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  td: { padding: "10px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
} as const;

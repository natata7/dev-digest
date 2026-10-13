import type { CSSProperties } from "react";

export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  tiles: { display: "flex", gap: 12 } satisfies CSSProperties,
  tile: { flex: 1, minWidth: 0, background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 9, padding: 14 } satisfies CSSProperties,
  tileLabel: { fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)" } satisfies CSSProperties,
  tileRow: { display: "flex", alignItems: "baseline", gap: 8, marginTop: 8, flexWrap: "nowrap", whiteSpace: "nowrap" } satisfies CSSProperties,
  from: { fontSize: 15, color: "var(--text-muted)" } satisfies CSSProperties,
  to: { fontSize: 26, fontWeight: 700 } satisfies CSSProperties,
  label: { fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "var(--text-muted)" } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, fontSize: 13, color: "var(--text-secondary)", marginTop: 8 } satisfies CSSProperties,
  diff: {
    marginTop: 10,
    padding: 14,
    background: "var(--bg-sunken, var(--bg-base))",
    border: "1px solid var(--border)",
    borderRadius: 9,
    fontSize: 13,
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
    maxHeight: 320,
    overflow: "auto",
  } satisfies CSSProperties,
  skip: { color: "var(--text-muted)", fontStyle: "italic", padding: "2px 0" } satisfies CSSProperties,
  muted: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
export const LINE_BG = {
  same: "transparent",
  add: "rgba(46,160,67,.18)",
  del: "rgba(248,81,73,.18)",
} as const;

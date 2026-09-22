import type { CSSProperties } from "react";

/** Co-located styles for DiffTab's group sections. Per-side border longhands
 *  only — never bare `borderColor`/`borderWidth` mixed with a single-side
 *  override (see client/INSIGHTS.md 2026-09-14). */
export const s = {
  group: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 4px",
    cursor: "pointer",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderLeftWidth: 0,
    borderBottomStyle: "solid",
    borderBottomColor: "var(--border)",
  } satisfies CSSProperties,
  groupLabel: { fontSize: 13, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  groupCount: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  groupFindingsCount: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  groupsWrap: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  groupFindingDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--danger, #e5484d)",
    flexShrink: 0,
  } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the group section is open (mirrors FileCard). */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}

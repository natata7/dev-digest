/* MetricTile — one eval metric: label, big percentage, ▲/▼ delta in points. */
import React from "react";
import { deltaPts, pct } from "./helpers";

const TONE = { up: "var(--ok)", down: "var(--crit)", flat: "var(--text-muted)" } as const;

export function MetricTile({
  label,
  value,
  delta,
  color,
}: {
  label: string;
  /** Fraction 0..1, or null when the metric is undefined for this run. */
  value: number | null;
  /** Change vs the previous run, as a fraction. */
  delta?: number | null;
  color: string;
}) {
  const d = deltaPts(delta);
  return (
    <div
      data-testid={`metric-${label.toLowerCase().replace(/\s+/g, "-")}`}
      style={{
        flex: 1,
        minWidth: 0,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 9,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 10 }}>
        <span className="tnum" style={{ fontSize: 28, fontWeight: 700, color }}>
          {pct(value)}
        </span>
        {d && (
          <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: TONE[d.tone] }}>
            {d.text}
          </span>
        )}
      </div>
    </div>
  );
}

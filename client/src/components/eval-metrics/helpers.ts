/* Pure formatting helpers shared by the Evals tab and the Eval Dashboard. */

/** 0.824 → "82%"; null (undefined metric) → "—". */
export function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n * 100)}%`;
}

export interface DeltaView {
  text: string;
  tone: "up" | "down" | "flat";
}

/** Delta in fractions → whole percentage points, e.g. 0.04 → "▲ 4pt". null → no delta. */
export function deltaPts(d: number | null | undefined): DeltaView | null {
  if (d == null) return null;
  const pts = Math.round(d * 100);
  if (pts === 0) return { text: "— 0pt", tone: "flat" };
  return pts > 0 ? { text: `▲ ${pts}pt`, tone: "up" } : { text: `▼ ${Math.abs(pts)}pt`, tone: "down" };
}

export function money(n: number | null | undefined): string {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}

/** milliseconds → "1.8s" (or "—"). */
export function seconds(ms: number | null | undefined): string {
  return ms == null ? "—" : `${(ms / 1000).toFixed(1)}s`;
}

/** ISO → "2026-05-29 09:14" (local time, fixed format so tables line up). */
export function when(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

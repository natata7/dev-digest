export type DiffLine = { kind: "same" | "add" | "del"; text: string };

/** Line diff via longest common subsequence — prompts are short, O(n·m) is fine. */
export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "del", text: a[i++]! });
    } else {
      out.push({ kind: "add", text: b[j++]! });
    }
  }
  while (i < a.length) out.push({ kind: "del", text: a[i++]! });
  while (j < b.length) out.push({ kind: "add", text: b[j++]! });
  return out;
}

export const hasChanges = (d: DiffLine[]) => d.some((l) => l.kind !== "same");

export type ShownLine = DiffLine | { kind: "skip"; count: number };

/** Keep changed lines plus `ctx` lines around them; fold the rest into "N unchanged lines" markers. */
export function collapseContext(lines: DiffLine[], ctx = 2): ShownLine[] {
  const keep = lines.map((l) => l.kind !== "same");
  const near = keep.map((_, i) => {
    for (let d = -ctx; d <= ctx; d++) if (keep[i + d]) return true;
    return false;
  });
  const out: ShownLine[] = [];
  let hidden = 0;
  lines.forEach((l, i) => {
    if (near[i]) {
      if (hidden) out.push({ kind: "skip", count: hidden });
      hidden = 0;
      out.push(l);
    } else hidden++;
  });
  if (hidden) out.push({ kind: "skip", count: hidden });
  return out;
}

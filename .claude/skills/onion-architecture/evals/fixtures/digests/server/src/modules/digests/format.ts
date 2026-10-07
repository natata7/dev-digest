export interface DigestItem {
  id: string;
  title: string;
  severity: string;
  priority: number;
}

export function renderDigest(items: DigestItem[]): string {
  if (items.length === 0) return 'No findings worth reporting.';
  return items.map((i, n) => `${n + 1}. [${i.severity}] ${i.title}`).join('\n');
}

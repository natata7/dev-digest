import { readFileSync } from 'node:fs';
import type { Finding } from '@devdigest/shared';

const weights: Record<string, number> = JSON.parse(
  readFileSync(new URL('./severity-weights.json', import.meta.url), 'utf8'),
);

export function severityScore(findings: Finding[]): number {
  return findings.reduce((sum, f) => sum + (weights[f.severity] ?? 0), 0);
}

export function worstSeverity(findings: Finding[]): string | null {
  if (findings.length === 0) return null;
  return [...findings].sort((a, b) => (weights[b.severity] ?? 0) - (weights[a.severity] ?? 0))[0].severity;
}

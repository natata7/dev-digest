import type { SmartDiffRole } from '@devdigest/shared';
import { CLASSIFY_RULES, type RoleRule } from './constants.js';

function stripLeadingDotSlash(path: string): string {
  return path.startsWith('./') ? path.slice(2) : path;
}

function basenameOf(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

function matches(path: string, base: string, segments: string[], pattern: RoleRule['patterns'][number]): boolean {
  switch (pattern.kind) {
    case 'suffix':
      return path.endsWith(pattern.value);
    case 'basename':
      return base === pattern.value;
    case 'basenamePrefix':
      return base.startsWith(pattern.value);
    case 'segment':
      return segments.includes(pattern.value);
  }
}

/**
 * Classify one changed file's path into a Smart Diff role. Pure — no
 * Fastify/Drizzle/Container imports — reusable as a standalone pre-prompt
 * filter, not just from the smart-diff route.
 */
export function classifyFile(rawPath: string): SmartDiffRole {
  const path = stripLeadingDotSlash(rawPath);
  const base = basenameOf(path);
  const segments = path.split('/');
  for (const rule of CLASSIFY_RULES) {
    if (rule.patterns.some((p) => matches(path, base, segments, p))) return rule.role;
  }
  return 'core';
}

import type { SkillScanFinding, SkillScanResult, SkillScanSeverity } from '@devdigest/shared';

/**
 * Level-1 injection scan — pure regex, synchronous, no I/O. Runs on both
 * preview and confirm (protects the file-upload path too, since an uploaded
 * file is equally untrusted). See `scan-llm.ts` for the best-effort Level-2
 * (LLM) pass that can only ever raise this verdict, never lower it.
 */

export interface InjectionRule {
  id: string;
  severity: 'malicious' | 'suspicious';
  pattern: RegExp;
}

const RANK: Record<SkillScanSeverity, number> = { clean: 0, suspicious: 1, malicious: 2 };

export const INJECTION_RULES: InjectionRule[] = [
  // ---- malicious ----
  {
    id: 'ignore-previous-instructions',
    severity: 'malicious',
    pattern: /\bignore\s+(all\s+|any\s+)?(previous|prior|earlier)\s+(instructions?|prompts?|rules?|directives?)\b/i,
  },
  {
    id: 'disregard-above',
    severity: 'malicious',
    pattern: /\bdisregard\s+(the\s+)?(above|system|prior)\b/i,
  },
  {
    id: 'role-override',
    severity: 'malicious',
    pattern: /\byou\s+are\s+now\s+(a|an|the)\b/i,
  },
  {
    id: 'new-system-prompt',
    severity: 'malicious',
    pattern: /\b(new|updated)\s+system\s+prompt\b/i,
  },
  {
    id: 'disable-safety',
    severity: 'malicious',
    pattern: /\b(override|bypass|disable)\s+(the\s+)?(safety|guardrails?|filters?|restrictions?)\b/i,
  },
  {
    id: 'privileged-mode',
    severity: 'malicious',
    pattern: /\b(developer|admin|god|root)\s+mode\b/i,
  },
  {
    id: 'jailbreak',
    severity: 'malicious',
    pattern: /\b(jailbreak|DAN)\b/i,
  },
  {
    id: 'secret-exfil',
    severity: 'malicious',
    pattern:
      /\b(send|post|upload|leak)\b(?:(?!\n).){0,40}?\b(api[_-]?key|secret|token|credentials?|\.env|password)\b|\b(api[_-]?key|secret|token|credentials?|\.env|password)\b(?:(?!\n).){0,40}?\b(send|post|upload|leak)\b/i,
  },
  {
    id: 'token-in-url',
    severity: 'malicious',
    pattern: /[?&](token|key|api_key)=/i,
  },
  {
    id: 'command-exec',
    severity: 'malicious',
    pattern: /\brm\s+-rf\b|\bchild_process\b|\bexecSync\b|\beval\(|curl\s(?:(?!\n).){0,60}?\|\s*(sh|bash)\b|\bbase64\s+-d\b/i,
  },
  // ---- suspicious ----
  {
    id: 'system-prompt-mention',
    severity: 'suspicious',
    pattern: /\bsystem prompt\b/i,
  },
  {
    id: 'html-comment-instructions',
    severity: 'suspicious',
    pattern: /<!--[\s\S]*?(instructions?|ignore|system|prompt)[\s\S]*?-->/i,
  },
  {
    id: 'interpolated-image-url',
    severity: 'suspicious',
    pattern: /!\[[^\]]*\]\([^)]*(\$\{|\{\{)[^)]*\)/,
  },
  {
    id: 'invisible-unicode',
    severity: 'suspicious',
    pattern: /[​-‏‪-‮﻿]/,
  },
];

/** ~120 chars of context around a match, capped to the schema's 200-char max —
 *  never dumps the whole body into a finding. */
function excerptAround(body: string, index: number, length: number): string {
  const start = Math.max(0, index - 60);
  const end = Math.min(body.length, index + length + 60);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < body.length ? '…' : '';
  return (prefix + body.slice(start, end) + suffix).slice(0, 200);
}

function maxSeverity(a: SkillScanSeverity, b: SkillScanSeverity): SkillScanSeverity {
  return RANK[a] >= RANK[b] ? a : b;
}

export function scanSkillBody(body: string): SkillScanResult {
  const findings: SkillScanFinding[] = [];
  for (const rule of INJECTION_RULES) {
    const match = rule.pattern.exec(body);
    if (match) {
      findings.push({
        rule: rule.id,
        severity: rule.severity,
        excerpt: excerptAround(body, match.index, match[0].length),
      });
    }
  }
  const severity = findings.reduce<SkillScanSeverity>((acc, f) => maxSeverity(acc, f.severity), 'clean');
  return { severity, findings, llm_checked: false };
}

/**
 * Combine the Level-1 (regex) result with a Level-2 (LLM) result. The core
 * security property: this can only RAISE `base`'s severity, never lower it —
 * `severity = max(base, llm)` over rank clean < suspicious < malicious.
 */
export function mergeScans(base: SkillScanResult, llm: SkillScanResult): SkillScanResult {
  return {
    severity: maxSeverity(base.severity, llm.severity),
    findings: [...base.findings, ...llm.findings],
    llm_checked: true,
  };
}

export function isBlocked(result: SkillScanResult): boolean {
  return result.severity === 'malicious';
}

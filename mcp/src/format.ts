import type { Agent, ConventionList, ReviewDto, Severity } from '@devdigest/shared';

/**
 * Pure text formatting (no I/O). Output is compact text, not JSON — cheaper
 * for the model to read. Repo/LLM-authored text is fenced as untrusted data.
 */

/** Hard cap per tool response (~6k tokens) — well under Claude Code's 10k-token warning. */
export const MAX_CHARS = 24_000;
const DETAIL_CHARS = 600;
const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export type ResponseFormat = 'concise' | 'detailed';

// ponytail: copy of reviewer-core/src/prompt.ts `wrapUntrusted` (importing reviewer-core drags in `openai`).
export function fence(source: string, text: string): string {
  return `<untrusted source="${source}">\n${text.replaceAll('</untrusted', '<\\/untrusted')}\n</untrusted>`;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Final guard on any tool output. */
export function cap(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return `${text.slice(0, MAX_CHARS)}\n… [truncated at ${MAX_CHARS} chars — narrow with min_severity / limit]`;
}

export function formatAgents(agents: Agent[]): string {
  if (agents.length === 0) return 'No agents configured — create one in the DevDigest UI (Agents).';
  const lines = agents.map(
    (a) =>
      `- ${a.name} — id ${a.id} · ${a.provider}/${a.model} · ${a.enabled ? 'enabled' : 'DISABLED'}` +
      (a.description ? ` · ${clip(a.description, 100)}` : ''),
  );
  return `${agents.length} agent${agents.length === 1 ? '' : 's'}:\n${lines.join('\n')}`;
}

export function formatReview(
  review: ReviewDto,
  opts: { minSeverity: Severity; limit: number; format: ResponseFormat },
): string {
  const all = review.findings;
  const kept = all.filter((f) => SEVERITY_RANK[f.severity] <= SEVERITY_RANK[opts.minSeverity]);
  const shown = kept.slice(0, opts.limit);

  const counts = (['CRITICAL', 'WARNING', 'SUGGESTION'] as const)
    .map((s) => [s, all.filter((f) => f.severity === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${s}`)
    .join(', ');
  const header =
    `${review.agent_name ?? 'Agent'} · run ${review.run_id ?? '—'} · verdict ${review.verdict ?? '—'}` +
    ` · score ${review.score ?? '—'}/100 · ${all.length} findings${counts ? ` (${counts})` : ''}`;

  const body: string[] = [];
  if (review.summary) body.push(`Summary: ${clip(review.summary, DETAIL_CHARS)}`);
  shown.forEach((f, i) => {
    const lines = f.end_line > f.start_line ? `${f.start_line}-${f.end_line}` : `${f.start_line}`;
    const state = f.dismissed_at ? ' [dismissed]' : f.accepted_at ? ' [accepted]' : '';
    body.push(`${i + 1}. ${f.severity} ${f.category} ${f.file}:${lines} — ${f.title}${state}`);
    if (opts.format === 'detailed') {
      body.push(`   Why: ${clip(f.rationale, DETAIL_CHARS)}`);
      if (f.suggestion) body.push(`   Fix: ${clip(f.suggestion, DETAIL_CHARS)}`);
    }
  });
  if (shown.length === 0) body.push(all.length ? `No findings at ${opts.minSeverity} or above.` : 'No findings.');

  const out = [header, fence('review-findings', body.join('\n'))];
  if (kept.length > shown.length) {
    out.push(`Showing ${shown.length} of ${kept.length} findings — raise limit or set min_severity.`);
  }
  return out.join('\n');
}

export function formatConventions(
  repoName: string,
  list: ConventionList,
  opts: { status: 'accepted' | 'pending' | 'all'; limit: number; format: ResponseFormat },
): string {
  if (!list.extracted_at && list.items.length === 0) {
    return `No conventions extracted yet for ${repoName} — run Extract on the repo's Conventions tab in the DevDigest UI.`;
  }
  const kept = opts.status === 'all' ? list.items : list.items.filter((c) => c.status === opts.status);
  if (kept.length === 0) {
    const pending = list.items.filter((c) => c.status === 'pending').length;
    return `${repoName}: 0 ${opts.status} conventions (${pending} pending, ${list.items.length} total) — pass status='all' to see them.`;
  }
  const shown = kept.slice(0, opts.limit);
  const header =
    `${repoName} — ${kept.length} ${opts.status === 'all' ? '' : `${opts.status} `}conventions` +
    ` (extracted ${list.extracted_at?.slice(0, 10) ?? '—'}, ${list.sample_file_count} files sampled)`;
  const lines = shown.map((c) => {
    const where =
      c.evidence_start_line != null
        ? `${c.evidence_path}:${c.evidence_start_line}-${c.evidence_end_line ?? c.evidence_start_line}`
        : c.evidence_path;
    const status = opts.status === 'all' ? ` [${c.status}]` : '';
    const line = `- [${c.category ?? 'general'}] ${c.rule} — ${where} (${c.confidence.toFixed(2)})${status}`;
    return opts.format === 'detailed' ? `${line}\n  ${clip(c.evidence_snippet, DETAIL_CHARS).replaceAll('\n', '\n  ')}` : line;
  });
  const out = [header, fence('repo-conventions', lines.join('\n'))];
  if (kept.length > shown.length) out.push(`Showing ${shown.length} of ${kept.length} — raise limit.`);
  return out.join('\n');
}

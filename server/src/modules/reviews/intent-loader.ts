import type { Container } from '../../platform/container.js';
import type { PrIntentRecord, RepoProvider, UnifiedDiff } from '@devdigest/shared';
import {
  classifyIntent,
  renderIntentBlock,
  type IntentFileInput,
  type IntentSourceInput,
} from '@devdigest/reviewer-core';
import { resolveFeatureModel } from '../settings/feature-models.js';
import { isSafeRepoPath } from '../conventions/helpers.js';
import type { RunLogger } from '../../platform/run-logger.js';
import type { ReviewRepository, PullRow, RepoRow } from './repository.js';

/**
 * Intent Layer — application-layer resolver. Turns a PR's already-known
 * fields (title/body) + two INTERNAL-only lookups (linked issue via the
 * repo's CodeHostClient, linked spec via GitClient.readFile against the
 * already-cloned repo) into `classifyIntent`'s pure input, then persists the
 * result. No outbound HTTP request is ever made against a URL taken from the
 * PR body — only these two already-trusted, already-injected clients.
 */

/** Conservative: `docs/…`, `spec(s)/…`, `plan(s)/…`, markdown only. Capped so a
 *  hostile PR body can't make us read/send an unbounded number of files. */
const SPEC_PATH_RE = /(?:docs|specs?|plans?)\/[\w./-]+\.(?:md|mdx)/g;
const MAX_SPEC_PATHS = 3;
const MAX_SPEC_CHARS = 8_000;

function extractSpecPaths(body: string): string[] {
  const matches = [...body.matchAll(SPEC_PATH_RE)].map((m) => m[0]);
  return [...new Set(matches)].filter(isSafeRepoPath).slice(0, MAX_SPEC_PATHS);
}

/** Same "thrown OR empty/whitespace ⇒ unavailable" rule as `conventions`'
 *  `readCloneText` (see INSIGHTS.md — MockGitClient returns '', SimpleGitClient throws). */
async function readSpecText(container: Container, repoRow: RepoRow, path: string): Promise<string | null> {
  try {
    const text = await container.git.readFile({ owner: repoRow.owner, name: repoRow.name }, path);
    if (typeof text !== 'string' || text.trim() === '') return null;
    return text.slice(0, MAX_SPEC_CHARS);
  } catch {
    return null;
  }
}

async function resolveSpecSources(
  container: Container,
  repoRow: RepoRow,
  pull: PullRow,
): Promise<IntentSourceInput[]> {
  const paths = extractSpecPaths(pull.body ?? '');
  const out: IntentSourceInput[] = [];
  for (const path of paths) {
    out.push({ kind: 'spec', ref: path, text: await readSpecText(container, repoRow, path) });
  }
  return out;
}

/** True when the PR body mentions an issue at all (`#123`) — independent of
 *  whether the code-host adapter manages to resolve it, so an unresolvable
 *  reference still surfaces as an `unavailable` source rather than silently
 *  vanishing. */
async function resolveIssueSource(
  container: Container,
  repoRow: RepoRow,
  pull: PullRow,
  runLog: RunLogger,
): Promise<IntentSourceInput | undefined> {
  const m = (pull.body ?? '').match(/#(\d+)/);
  if (!m) return undefined;
  const ref = `#${m[1]}`;
  try {
    const host = await container.codeHost(repoRow.provider as RepoProvider);
    const detail = await host.getPullRequest({ owner: repoRow.owner, name: repoRow.name }, pull.number);
    const issue = detail.linked_issue;
    if (!issue) return { kind: 'linked_issue', ref, text: null };
    const text = [issue.title, issue.body ?? ''].filter(Boolean).join('\n\n').trim();
    return { kind: 'linked_issue', ref: `#${issue.number}`, text: text || null };
  } catch (err) {
    runLog.info(`intent: linked issue ${ref} unavailable — ${(err as Error).message}`);
    return { kind: 'linked_issue', ref, text: null };
  }
}

function hunkHeader(h: { oldStart: number; oldLines: number; newStart: number; newLines: number }): string {
  return `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`;
}

function toFileInputs(diff: UnifiedDiff): IntentFileInput[] {
  return diff.files.map((f) => ({ path: f.path, hunkHeaders: f.hunks.map(hunkHeader) }));
}

/**
 * Derive (or reuse) a PR's Intent record.
 *
 * Reuse: when an intent already exists AND was computed against the PR's
 * CURRENT head_sha, it's returned as-is — zero LLM calls. `opts.force` skips
 * the reuse check (manual "PR updated — recompute" trigger).
 */
export async function loadIntent(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: RepoRow,
  diff: UnifiedDiff,
  runLog: RunLogger,
  opts: { force?: boolean } = {},
): Promise<PrIntentRecord> {
  if (!opts.force) {
    const existing = await repo.getIntent(pull.id);
    if (existing && existing.head_sha === pull.headSha) {
      runLog.info('Intent prompt composed', {
        cached: true,
        provider: existing.provider,
        model: existing.model,
        sources: existing.sources.map((s) => `${s.kind}:${s.ref}:${s.status}`),
      });
      runLog.result(
        `Intent: confidence=${existing.confidence}, in_scope=${existing.in_scope.length}, out_of_scope=${existing.out_of_scope.length} (cached)`,
      );
      return existing;
    }
  }

  const choice = await resolveFeatureModel(container, workspaceId, 'review_intent');
  const llm = await container.llm(choice.provider);

  const issueSource = await resolveIssueSource(container, repoRow, pull, runLog);
  const specSources = await resolveSpecSources(container, repoRow, pull);
  const sources: IntentSourceInput[] = issueSource ? [issueSource, ...specSources] : specSources;

  const outcome = await classifyIntent({
    title: pull.title,
    description: pull.body,
    sources,
    files: toFileInputs(diff),
    llm,
    model: choice.model,
    sessionId: `${repoRow.owner}/${repoRow.name}#${pull.number}:intent`,
    onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
  });

  // Real usage from the classifier call (no need to re-estimate with the
  // tokenizer — we already have the provider's own count).
  runLog.info('Intent prompt composed', {
    sections: outcome.sections,
    provider: choice.provider,
    model: choice.model,
    tokens_in: outcome.tokensIn,
    tokens_out: outcome.tokensOut,
    sources: outcome.intent.sources.map((s) => `${s.kind}:${s.ref}:${s.status}`),
    cached: false,
  });
  runLog.result(
    `Intent: confidence=${outcome.intent.confidence}, in_scope=${outcome.intent.in_scope.length}, out_of_scope=${outcome.intent.out_of_scope.length}`,
  );

  const meta = { headSha: pull.headSha, provider: choice.provider, model: choice.model };
  await repo.upsertIntent(pull.id, outcome.intent, meta);

  return {
    pr_id: pull.id,
    ...outcome.intent,
    head_sha: meta.headSha,
    provider: meta.provider,
    model: meta.model,
    computed_at: new Date().toISOString(),
  };
}

/**
 * Best-effort wrapper for the shared pre-work step in `executeRuns`: unlike
 * diff loading, a failed intent derivation must NOT fail the queued runs —
 * it just means every agent's prompt omits the "## Declared intent & scope"
 * section (identical to before this feature existed).
 */
export async function deriveIntentBlock(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: RepoRow,
  diff: UnifiedDiff,
  runLog: RunLogger,
): Promise<string | undefined> {
  try {
    const intent = await runLog.step(
      'Deriving PR intent',
      () => loadIntent(container, repo, workspaceId, pull, repoRow, diff, runLog),
      { kind: 'tool' },
    );
    return renderIntentBlock(intent);
  } catch (err) {
    runLog.info(`Intent unavailable — ${(err as Error).message}`);
    return undefined;
  }
}

import type { BlastRadius, PrHistory, RepoProvider } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import type { PullRow } from '../../db/rows.js';
import { NotFoundError } from '../../platform/errors.js';
import { PullsService } from '../pulls/service.js';
import { toBlastRadius, toPriorHistory } from './helpers.js';

/** Minimal pino-compatible logger (info for the served line, warn for the detail refresh). */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

/** How many prior PRs/MRs to surface in the history block. */
const HISTORY_LIMIT = 5;
/** Adapter collects more candidates than shown so the overlap sort picks the best 5, not the first 5 found. */
const HISTORY_CANDIDATES = 25;

// In-memory cache for history() — keyed by `${prId}:${headSha}`, so a re-run
// on the same PR head doesn't re-hit the code host. Bounded (evict oldest
// beyond MAX_CACHE_ENTRIES) — this is a small process-lifetime cache, not a
// correctness-critical store; a restart or a new head sha just re-fetches.
const MAX_CACHE_ENTRIES = 200;
const historyCache = new Map<string, PrHistory>();

function cacheHistory(key: string, value: PrHistory): void {
  historyCache.set(key, value);
  if (historyCache.size > MAX_CACHE_ENTRIES) {
    const oldest = historyCache.keys().next().value;
    if (oldest !== undefined) historyCache.delete(oldest);
  }
}

/**
 * Blast radius service. Read-only: resolves the PR + repo (workspace-scoped,
 * via the shared `container.reviewRepo` — the cross-cutting pulls repository
 * every module reuses instead of duplicating the query), collects the PR's
 * changed files, and calls `container.repoIntel.getBlastRadius` exactly once.
 * All grouping/summary logic lives in the pure `toBlastRadius` mapper.
 */
export class BlastService {
  constructor(private container: Container) {}

  async get(workspaceId: string, prId: string, logger?: Logger): Promise<BlastRadius> {
    const pr = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.container.reviewRepo.getRepo(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const changedFiles = await this.resolveChangedFiles(workspaceId, pr, logger);

    const [result, indexState] = await Promise.all([
      this.container.repoIntel.getBlastRadius(repo.id, changedFiles),
      this.container.repoIntel.getIndexState(repo.id),
    ]);
    const blast = toBlastRadius(result, indexState.lastIndexedSha || undefined);

    logger?.info(
      {
        prId,
        degraded: blast.degraded ?? false,
        reason: blast.reason,
        symbols: blast.changed_symbols.length,
        callers: blast.downstream.reduce((sum, d) => sum + d.callers.length, 0),
      },
      'blast served from index',
    );

    return blast;
  }

  /**
   * Merged PRs/MRs that previously touched the same files ("Prior PRs").
   * Never throws: a code-host/adapter failure is logged and degrades to an
   * empty history (200), same "best-effort enrichment" contract as the
   * intent block (see `reviews/intent-loader.ts`) — an unknown PR/repo still
   * 404s, since that's a caller bug, not a code-host hiccup.
   */
  async history(workspaceId: string, prId: string, logger?: Logger): Promise<PrHistory> {
    const pr = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pr) throw new NotFoundError('Pull request not found');
    const repo = await this.container.reviewRepo.getRepo(pr.repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const cacheKey = `${prId}:${pr.headSha}`;
    const cached = historyCache.get(cacheKey);
    if (cached) return cached;

    try {
      const changedFiles = await this.resolveChangedFiles(workspaceId, pr, logger);
      const codeHost = await this.container.codeHost(repo.provider as RepoProvider);
      const prior = await codeHost.listPriorPullRequests(
        { owner: repo.owner, name: repo.name },
        changedFiles,
        { excludeNumber: pr.number, limit: HISTORY_CANDIDATES },
      );
      const result: PrHistory = { history: toPriorHistory(prior, HISTORY_LIMIT) };
      cacheHistory(cacheKey, result);
      return result;
    } catch (err) {
      logger?.warn({ err, prId }, 'PR history unavailable (code host error); serving empty');
      return { history: [] };
    }
  }

  /**
   * Changed files for a PR — from persisted `pr_files`, falling back to a
   * fresh detail fetch (`PullsService.getDetail`) when none are persisted yet
   * (PR files land only once the detail was fetched via the PR page / sync;
   * a caller that arrives first — MCP, direct link — would otherwise see an
   * empty file list). Shared by `get()` and `history()`.
   */
  private async resolveChangedFiles(
    workspaceId: string,
    pr: PullRow,
    logger?: Logger,
  ): Promise<string[]> {
    const files = (await this.container.reviewRepo.getPrFiles(pr.id)).map((f) => f.path);
    if (files.length > 0) return files;
    const detail = await new PullsService(this.container).getDetail(workspaceId, pr.id, logger);
    return detail.files.map((f) => f.path);
  }
}

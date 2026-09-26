import { describe, it, expect, vi } from 'vitest';
import { PrHistory } from '@devdigest/shared';
import type { IndexState, RepoIntel } from '../repo-intel/types.js';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { BlastService } from './service.js';

const getDetail = vi.fn();
vi.mock('../pulls/service.js', () => ({
  PullsService: vi.fn().mockImplementation(() => ({ getDetail })),
}));

/**
 * Hermetic — no Postgres. `container` is a duck-typed fake exposing only
 * `reviewRepo`/`repoIntel` (same pattern as `reviews-intent.test.ts`'s
 * `fakeContainer`); `BlastService.get` never constructs its own repository.
 */

const PR = { id: 'pr-1', repoId: 'repo-1', number: 100, headSha: 'sha-1' };
const REPO = { id: 'repo-1', provider: 'github', owner: 'acme', name: 'app' };
const FILES = [{ path: 'src/a.ts' }, { path: 'src/b.ts' }];

function fakeContainer(opts: {
  getBlastRadius?: ReturnType<typeof vi.fn>;
  getPull?: (workspaceId: string, prId: string) => Promise<unknown>;
  getIndexState?: () => Promise<IndexState>;
  files?: { path: string }[];
  codeHost?: (provider: string) => Promise<{ listPriorPullRequests: ReturnType<typeof vi.fn> }>;
}): Container {
  return {
    reviewRepo: {
      getPull: opts.getPull ?? (async () => PR),
      getRepo: async () => REPO,
      getPrFiles: async () => opts.files ?? FILES,
    },
    repoIntel: {
      getBlastRadius: opts.getBlastRadius ?? vi.fn(),
      getIndexState: opts.getIndexState ?? (async () => ({ lastIndexedSha: 'sha-1' }) as IndexState),
    } satisfies Partial<RepoIntel>,
    codeHost:
      opts.codeHost ?? (async () => ({ listPriorPullRequests: vi.fn().mockResolvedValue([]) })),
  } as unknown as Container;
}

function baseBlastResult() {
  return { changedSymbols: [], callers: [], impactedEndpoints: [] };
}

describe('BlastService.get', () => {
  it('calls getBlastRadius exactly once, with the repo id and the PR changed file paths', async () => {
    const getBlastRadius = vi.fn().mockResolvedValue(baseBlastResult());
    const container = fakeContainer({ getBlastRadius });

    await new BlastService(container).get('ws-1', 'pr-1');

    expect(getBlastRadius).toHaveBeenCalledTimes(1);
    expect(getBlastRadius).toHaveBeenCalledWith('repo-1', ['src/a.ts', 'src/b.ts']);
  });

  it('throws NotFoundError when the PR does not exist', async () => {
    const getBlastRadius = vi.fn().mockResolvedValue(baseBlastResult());
    const container = fakeContainer({ getBlastRadius, getPull: async () => undefined });

    await expect(new BlastService(container).get('ws-1', 'unknown-pr')).rejects.toThrow(NotFoundError);
    expect(getBlastRadius).not.toHaveBeenCalled();
  });

  it('passes a degraded facade result straight through', async () => {
    const getBlastRadius = vi.fn().mockResolvedValue({
      ...baseBlastResult(),
      degraded: true,
      reason: 'index_partial',
    });
    const container = fakeContainer({ getBlastRadius });

    const blast = await new BlastService(container).get('ws-1', 'pr-1');

    expect(blast.degraded).toBe(true);
    expect(blast.reason).toBe('index_partial');
  });

  it('logs "blast served from index" with prId, degraded, reason and counts', async () => {
    const getBlastRadius = vi.fn().mockResolvedValue({
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'src/caller.ts', symbol: 'c', viaSymbol: 'foo', line: 1, rank: 0 }],
      impactedEndpoints: [],
    });
    const container = fakeContainer({ getBlastRadius });
    const info = vi.fn();

    await new BlastService(container).get('ws-1', 'pr-1', { info, warn: vi.fn() });

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        prId: 'pr-1',
        degraded: false,
        symbols: 1,
        callers: 1,
      }),
      'blast served from index',
    );
  });

  it('fetches PR detail for the changed files when none are persisted yet (e.g. first call via MCP)', async () => {
    getDetail.mockResolvedValueOnce({ files: [{ path: 'src/late.ts' }] });
    const getBlastRadius = vi.fn().mockResolvedValue(baseBlastResult());
    const container = fakeContainer({ getBlastRadius, files: [] });

    await new BlastService(container).get('ws-1', 'pr-1');

    expect(getDetail).toHaveBeenCalledWith('ws-1', 'pr-1', undefined);
    expect(getBlastRadius).toHaveBeenCalledWith('repo-1', ['src/late.ts']);
  });
});

describe('BlastService.history', () => {
  it('resolves prior PRs via the code host, passing excludeNumber = pr.number and the changed files', async () => {
    const listPriorPullRequests = vi.fn().mockResolvedValue([
      { number: 5, title: 'Earlier fix', author: 'marisa', merged_at: '2026-01-01T00:00:00Z', files: ['src/a.ts'] },
    ]);
    const container = fakeContainer({
      getPull: async () => ({ ...PR, id: 'pr-h1', number: 100, headSha: 'sha-h1' }),
      codeHost: async () => ({ listPriorPullRequests }),
    });

    const result = await new BlastService(container).history('ws-1', 'pr-h1');

    expect(listPriorPullRequests).toHaveBeenCalledWith(
      { owner: REPO.owner, name: REPO.name },
      ['src/a.ts', 'src/b.ts'],
      { excludeNumber: 100, limit: 25 },
    );
    expect(result.history).toHaveLength(1);
    expect(result.history[0]).toMatchObject({ pr_number: 5, notes: 'touched 1 of these files' });
    expect(() => PrHistory.parse(result)).not.toThrow();
  });

  it('throws NotFoundError for an unknown PR, without calling the code host', async () => {
    const listPriorPullRequests = vi.fn();
    const container = fakeContainer({
      getPull: async () => undefined,
      codeHost: async () => ({ listPriorPullRequests }),
    });

    await expect(new BlastService(container).history('ws-1', 'unknown-pr')).rejects.toThrow(
      NotFoundError,
    );
    expect(listPriorPullRequests).not.toHaveBeenCalled();
  });

  it('degrades to {history: []} and logs a warning when the code host throws', async () => {
    const listPriorPullRequests = vi.fn().mockRejectedValue(new Error('rate limited'));
    const container = fakeContainer({
      getPull: async () => ({ ...PR, id: 'pr-h3', number: 100, headSha: 'sha-h3' }),
      codeHost: async () => ({ listPriorPullRequests }),
    });
    const warn = vi.fn();

    const result = await new BlastService(container).history('ws-1', 'pr-h3', {
      info: vi.fn(),
      warn,
    });

    expect(result).toEqual({ history: [] });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ prId: 'pr-h3' }),
      expect.stringContaining('unavailable'),
    );
  });

  it('caches by prId + head sha: a second call for the same PR + head does not hit the code host again', async () => {
    const listPriorPullRequests = vi.fn().mockResolvedValue([
      { number: 6, title: 'x', author: 'bob', merged_at: '2026-01-01T00:00:00Z', files: ['src/a.ts'] },
    ]);
    const container = fakeContainer({
      getPull: async () => ({ ...PR, id: 'pr-h4', number: 100, headSha: 'sha-h4' }),
      codeHost: async () => ({ listPriorPullRequests }),
    });
    const service = new BlastService(container);

    const first = await service.history('ws-1', 'pr-h4');
    const second = await service.history('ws-1', 'pr-h4');

    expect(listPriorPullRequests).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('a different head sha for the same PR id is a cache miss — the code host is called again', async () => {
    const listPriorPullRequests = vi.fn().mockResolvedValue([]);
    let headSha = 'sha-h5-a';
    const container = fakeContainer({
      getPull: async () => ({ ...PR, id: 'pr-h5', number: 100, headSha }),
      codeHost: async () => ({ listPriorPullRequests }),
    });
    const service = new BlastService(container);

    await service.history('ws-1', 'pr-h5');
    headSha = 'sha-h5-b';
    await service.history('ws-1', 'pr-h5');

    expect(listPriorPullRequests).toHaveBeenCalledTimes(2);
  });
});

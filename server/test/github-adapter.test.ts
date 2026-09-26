import { describe, it, expect, vi, afterEach } from 'vitest';
import { OctokitGitHubClient } from '../src/adapters/github/octokit.js';

/**
 * Mocked-HTTP coverage for `OctokitGitHubClient.listPriorPullRequests` — no
 * real network. Octokit's REST client calls global `fetch` under the hood
 * (`@octokit/request`'s fetch-wrapper falls back to `globalThis.fetch`), so
 * stubbing `fetch` with real `Response` objects drives it without a live
 * GitHub API — same approach as `gitlab-adapter.test.ts`.
 */

const REPO = { owner: 'acme', name: 'payments-api' };

/** Queue-based fetch mock: each call shifts the next JSON body off the list. */
function mockFetchSequence(bodies: unknown[]) {
  const calls: string[] = [];
  const queue = [...bodies];
  const fn = vi.fn(async (url: string) => {
    calls.push(decodeURIComponent(url));
    const body = queue.shift();
    return new Response(JSON.stringify(body ?? []), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

function pr(
  overrides: Partial<{
    number: number;
    title: string;
    user: { login: string } | null;
    merged_at: string | null;
  }> = {},
) {
  return {
    number: 1,
    title: 'A PR',
    user: { login: 'marisa' },
    merged_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('OctokitGitHubClient.listPriorPullRequests', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps only merged PRs — an unmerged PR associated with the same commit is dropped', async () => {
    mockFetchSequence([
      [{ sha: 'c1' }], // commits touching the file
      [pr({ number: 1, merged_at: null }), pr({ number: 2, merged_at: '2026-01-01T00:00:00Z' })], // PRs for c1
    ]);
    const client = new OctokitGitHubClient('ghp_token');

    const prior = await client.listPriorPullRequests(REPO, ['src/a.ts'], {
      excludeNumber: 999,
      limit: 25,
    });

    expect(prior).toHaveLength(1);
    expect(prior[0]).toMatchObject({ number: 2, files: ['src/a.ts'] });
  });

  it('excludes the current PR number', async () => {
    mockFetchSequence([[{ sha: 'c1' }], [pr({ number: 42 }), pr({ number: 7 })]]);
    const client = new OctokitGitHubClient('ghp_token');

    const prior = await client.listPriorPullRequests(REPO, ['src/a.ts'], {
      excludeNumber: 42,
      limit: 25,
    });

    expect(prior.map((p) => p.number)).toEqual([7]);
  });

  it('dedupes by PR number, accumulating overlapping files across the commits/files that surfaced it', async () => {
    mockFetchSequence([
      [{ sha: 'c1' }], // commits for src/a.ts
      [pr({ number: 5 })], // PRs for c1
      [{ sha: 'c2' }], // commits for src/b.ts
      [pr({ number: 5 })], // PRs for c2 — same PR, a different file
    ]);
    const client = new OctokitGitHubClient('ghp_token');

    const prior = await client.listPriorPullRequests(REPO, ['src/a.ts', 'src/b.ts'], {
      excludeNumber: 999,
      limit: 25,
    });

    expect(prior).toHaveLength(1);
    expect(prior[0]!.files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('only walks commit history for the first 10 changed files', async () => {
    const files = Array.from({ length: 11 }, (_, i) => `src/file-${i}.ts`);
    // 10 files × 1 "list commits" call each, all returning zero commits — so
    // there is no follow-up "PRs for commit" call to also queue.
    const { fn, calls } = mockFetchSequence(Array.from({ length: 10 }, () => []));
    const client = new OctokitGitHubClient('ghp_token');

    await client.listPriorPullRequests(REPO, files, { excludeNumber: 999, limit: 25 });

    expect(fn).toHaveBeenCalledTimes(10);
    for (let i = 0; i < 10; i++) expect(calls[i]).toContain(`path=src/file-${i}.ts`);
    expect(calls.some((u) => u.includes('file-10'))).toBe(false);
  });

  it('respects the candidate limit even when more merged PRs are found', async () => {
    mockFetchSequence([
      [{ sha: 'c1' }, { sha: 'c2' }, { sha: 'c3' }], // 3 commits for one file
      [pr({ number: 1 })], // PRs for c1
      [pr({ number: 2 })], // PRs for c2
      [pr({ number: 3 })], // PRs for c3
    ]);
    const client = new OctokitGitHubClient('ghp_token');

    const prior = await client.listPriorPullRequests(REPO, ['src/a.ts'], {
      excludeNumber: 999,
      limit: 2,
    });

    expect(prior).toHaveLength(2);
  });
});

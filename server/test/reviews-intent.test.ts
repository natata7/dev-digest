import { describe, it, expect } from 'vitest';
import type { LLMProvider, RepoRef } from '@devdigest/shared';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { RunBus } from '../src/platform/sse.js';
import { RunLogger } from '../src/platform/run-logger.js';
import { loadIntent, deriveIntentBlock } from '../src/modules/reviews/intent-loader.js';
import type { Container } from '../src/platform/container.js';
import type { ReviewRepository, PullRow, RepoRow } from '../src/modules/reviews/repository.js';

/**
 * Intent Layer — application-layer resolver (`intent-loader.ts`). Hermetic:
 * no Postgres, no network. `container` and `repo` are duck-typed fakes
 * (same pattern as `repo-intel-facade-degraded.test.ts`) exposing only what
 * `loadIntent`/`deriveIntentBlock` actually call.
 */

const DRAFT = {
  intent: 'Add rate limiting to the public API',
  in_scope: ['Add a token-bucket limiter middleware'],
  out_of_scope: ['Refactor the auth module'],
  confidence: 'high',
};

function fakePull(overrides: Partial<PullRow> = {}): PullRow {
  return {
    id: 'pr-1',
    workspaceId: 'ws-1',
    repoId: 'repo-1',
    number: 482,
    title: 'Add rate limiting',
    author: 'marisa.koch',
    branch: 'feat/rl',
    base: 'main',
    headSha: 'sha-new',
    lastReviewedSha: null,
    additions: 10,
    deletions: 0,
    filesCount: 1,
    status: 'needs_review',
    body: 'Adds rate limiting.',
    openedAt: null,
    updatedAt: null,
    ...overrides,
  } as PullRow;
}

function fakeRepoRow(): RepoRow {
  return {
    id: 'repo-1',
    workspaceId: 'ws-1',
    provider: 'github',
    owner: 'acme',
    name: 'payments-api',
    fullName: 'acme/payments-api',
    defaultBranch: 'main',
    clonePath: null,
    lastPolledAt: null,
    conventionsExtractedAt: null,
    conventionsSampleCount: null,
    createdBy: null,
    createdAt: new Date(),
  } as RepoRow;
}

const EMPTY_DIFF = { raw: '', files: [{ path: 'src/api/limiter.ts', additions: 1, deletions: 0, hunks: [] }] };

/** A minimal Container: `db` backs `resolveFeatureModel` (no override rows →
 *  registry default: openrouter/google/gemini-2.5-flash-lite). */
function fakeContainer(opts: {
  llm: LLMProvider;
  readFile?: (repo: RepoRef, path: string) => Promise<string>;
}): Container {
  return {
    db: { select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }) },
    llm: async () => opts.llm,
    git: { readFile: opts.readFile ?? (async () => '') },
    codeHost: async () => ({
      getPullRequest: async () => {
        throw new Error('no code host configured in this test');
      },
    }),
  } as unknown as Container;
}

function fakeRepo(overrides: Partial<ReviewRepository> = {}): ReviewRepository {
  return {
    getIntent: async () => undefined,
    upsertIntent: async () => undefined,
    ...overrides,
  } as unknown as ReviewRepository;
}

function logger(): RunLogger {
  return new RunLogger(new RunBus(), ['run-1']);
}

describe('loadIntent — reuse / force / spec resolution', () => {
  it('reuses the persisted intent when head_sha matches — zero LLM calls', async () => {
    const llmCalls = { count: 0 };
    const llm: LLMProvider = {
      id: 'openrouter',
      completeStructured: async () => {
        llmCalls.count++;
        throw new Error('must not be called on cache hit');
      },
      listModels: async () => [],
      complete: async () => {
        throw new Error('not used');
      },
      embed: async () => [],
    };
    const pull = fakePull({ headSha: 'sha-cached' });
    const existing = {
      pr_id: pull.id,
      intent: 'cached intent',
      in_scope: [],
      out_of_scope: [],
      confidence: 'medium' as const,
      sources: [],
      head_sha: 'sha-cached',
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-lite',
      computed_at: '2026-01-01T00:00:00.000Z',
    };
    const repo = fakeRepo({ getIntent: async () => existing });
    const container = fakeContainer({ llm });

    const result = await loadIntent(container, repo, 'ws-1', pull, fakeRepoRow(), EMPTY_DIFF, logger());

    expect(result).toEqual(existing);
    expect(llmCalls.count).toBe(0);
  });

  it('force=true skips the reuse check and recomputes', async () => {
    const llm = new MockLLMProvider('openai', { structured: DRAFT });
    const pull = fakePull({ headSha: 'sha-same' });
    const existing = {
      pr_id: pull.id,
      intent: 'stale',
      in_scope: [],
      out_of_scope: [],
      confidence: 'medium' as const,
      sources: [],
      head_sha: 'sha-same', // matches — would be reused if force weren't set
      provider: 'openai',
      model: 'gpt-4.1',
      computed_at: '2026-01-01T00:00:00.000Z',
    };
    let upserted: unknown;
    const repo = fakeRepo({
      getIntent: async () => existing,
      upsertIntent: async (_id, intent, meta) => {
        upserted = { intent, meta };
      },
    });
    const container = fakeContainer({ llm });

    const result = await loadIntent(container, repo, 'ws-1', pull, fakeRepoRow(), EMPTY_DIFF, logger(), {
      force: true,
    });

    expect(result.intent).toBe(DRAFT.intent);
    expect(llm.calls.some((c) => c.method === 'completeStructured')).toBe(true);
    expect(upserted).toBeTruthy();
    // Registry default (no per-workspace override in this test's fake db).
    expect(result.provider).toBe('openrouter');
    expect(result.model).toBe('google/gemini-2.5-flash-lite');
  });

  it('an unresolvable spec (thrown read AND empty-string read) is reported unavailable, clamping confidence to low', async () => {
    const llm = new MockLLMProvider('openai', { structured: DRAFT });
    const pull = fakePull({
      body: 'See docs/specs/thrown.md and docs/specs/empty.md for details.',
    });
    const repo = fakeRepo();
    const container = fakeContainer({
      llm,
      readFile: async (_repo, path) => {
        if (path === 'docs/specs/thrown.md') throw new Error('ENOENT');
        if (path === 'docs/specs/empty.md') return '';
        return 'unexpected path: ' + path;
      },
    });

    const result = await loadIntent(container, repo, 'ws-1', pull, fakeRepoRow(), EMPTY_DIFF, logger());

    expect(result.sources).toEqual(
      expect.arrayContaining([
        { kind: 'spec', ref: 'docs/specs/thrown.md', status: 'unavailable' },
        { kind: 'spec', ref: 'docs/specs/empty.md', status: 'unavailable' },
      ]),
    );
    // The model self-reported 'high' — the server clamp overrides it to 'low'
    // because at least one declared source is unavailable.
    expect(result.confidence).toBe('low');
  });
});

describe('deriveIntentBlock — best-effort (a classifier failure must not fail the run)', () => {
  it('a failed classification resolves to undefined (no throw) and logs "Intent unavailable"', async () => {
    // Missing `confidence` → MockLLMProvider throws ("fixture failed schema").
    const badDraft = { intent: 'x', in_scope: [], out_of_scope: [] };
    const llm = new MockLLMProvider('openai', { structured: badDraft });
    const pull = fakePull();
    const repo = fakeRepo();
    const container = fakeContainer({ llm });
    const bus = new RunBus();
    const runLog = new RunLogger(bus, ['run-1']);

    const block = await expect(
      deriveIntentBlock(container, repo, 'ws-1', pull, fakeRepoRow(), EMPTY_DIFF, runLog),
    ).resolves.toBeUndefined();
    void block;

    const messages = bus.buffer('run-1').map((e) => e.msg);
    expect(messages.some((m) => m.includes('Intent unavailable'))).toBe(true);
  });
});

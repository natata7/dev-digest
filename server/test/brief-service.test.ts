import { describe, it, expect, vi } from 'vitest';
import type { PrBrief, PrBriefDraft } from '@devdigest/shared';
import { BriefService, loadBlast, loadIntent, loadSpecs } from '../src/modules/brief/service.js';
import { AppError, ConfigError, ExternalServiceError, NotFoundError } from '../src/platform/errors.js';

const SECRET_BODY = 'SECRET-DESCRIPTION-TEXT';
const SECRET_SPEC = 'SECRET-SPEC-TEXT';
const SECRET_SUMMARY = 'SECRET-SUMMARY-TEXT';

const draft = (over: Partial<PrBriefDraft> = {}): PrBriefDraft => ({
  summary: SECRET_SUMMARY,
  risks: [{ kind: 'k', title: 'R', explanation: 'e', severity: 'high', file_refs: ['src/a.ts', 'src/invented.ts'] }],
  review_focus: [{ file: 'src/a.ts', line: 3, reason: 'why' }],
  ...over,
});

interface Opts {
  files?: { path: string; additions: number; deletions: number; patch: string | null }[];
  body?: string | null;
  intent?: unknown;
  blast?: 'ok' | 'partial' | 'throws' | 'flag_off';
  agents?: { id: string; contextPaths: string[] }[];
  docs?: { path: string; text: string }[];
  settings?: unknown;
  llmFactory?: () => Promise<unknown>;
  completeStructured?: (req: unknown) => Promise<unknown>;
  pullMissing?: boolean;
}

function setup(o: Opts = {}) {
  const completeStructured = vi.fn(
    o.completeStructured ??
      (async () => ({ data: draft(), model: 'm-actual', tokensIn: 123, tokensOut: 45, costUsd: 0.01, raw: '', attempts: 2 })),
  );
  const provider = { id: 'openai', completeStructured, complete: vi.fn(), embed: vi.fn(), listModels: vi.fn() };
  const llmArgs: string[] = [];
  const pr = { id: 'pr1', repoId: 'r1', number: 7, title: 'Title', body: o.body === undefined ? SECRET_BODY : o.body, headSha: 'sha-head' };
  const calls: string[] = [];
  const container = {
    db: {
      select: () => ({
        from: () => ({
          where: async () => (o.settings ? [{ key: 'feature_models', value: o.settings }] : []),
        }),
      }),
    },
    llm: async (p: string) => {
      llmArgs.push(p);
      return o.llmFactory ? o.llmFactory() : provider;
    },
    reviewRepo: {
      getPull: async () => (calls.push('getPull'), o.pullMissing ? undefined : pr),
      getPrFiles: async () =>
        o.files ?? [{ path: 'src/a.ts', additions: 2, deletions: 1, patch: '@@ -1,1 +1,5 @@ fnCtx()\n+x' }],
      getIntent: async () =>
        o.intent === undefined
          ? { pr_id: 'pr1', provider: 'openai', intent: 'Do thing', in_scope: ['a'], out_of_scope: [], confidence: 'high', sources: [] }
          : o.intent,
      getRepo: async () => ({ id: 'r1', provider: 'github', owner: 'acme', name: 'x' }),
    },
    agentsRepo: {
      listEnabled: async () => o.agents ?? [{ id: 'ag1', contextPaths: ['docs/spec.md'] }],
      linkedSkills: async () => [],
    },
    contextService: {
      readDocs: async () => ({ docs: (o.docs ?? [{ path: 'docs/spec.md', text: SECRET_SPEC }]).map((d) => ({ ...d, tokens: 1 })) }),
    },
    repoIntel: {
      getBlastRadius: async () => {
        if (o.blast === 'throws') throw new Error('index down');
        return {
          changedSymbols: [{ name: 'foo', file: 'src/sym.ts', kind: 'function' }],
          callers: [{ file: 'src/caller.ts', symbol: 'bar', viaSymbol: 'foo', line: 40, rank: 1 }],
          impactedEndpoints: [],
          ...(o.blast === 'partial' ? { degraded: true, reason: 'index_partial' } : {}),
          ...(o.blast === 'flag_off' ? { degraded: true, reason: 'flag_off' } : {}),
        };
      },
      getIndexState: async () => ({ lastIndexedSha: 'idx-sha' }),
    },
  };
  let stored: unknown = null;
  const store = {
    get: vi.fn(async () => stored),
    upsert: vi.fn(async (_id: string, json: unknown) => {
      stored = json;
    }),
  };
  const svc = new BriefService(container as never, store as never);
  const log = { info: vi.fn() };
  return { svc, container, completeStructured, provider, llmArgs, store, log, calls, getStored: () => stored, setStored: (v: unknown) => (stored = v) };
}
type S = ReturnType<typeof setup>;
const gen = (s: S) => s.svc.generate('ws', 'pr1', s.log);
const userMsg = (s: S) =>
  (s.completeStructured.mock.calls[0]![0] as { messages: { role: string; content: string }[] }).messages[1]!.content;

describe('generate: the single LLM call (AC-24, NFR-2)', () => {
  it('one completeStructured with maxRetries 2 / maxTokens 2000 / timeoutMs 60000; no complete/embed', async () => {
    const s = setup();
    await gen(s);
    expect(s.completeStructured).toHaveBeenCalledTimes(1);
    expect(s.completeStructured.mock.calls[0]![0]).toMatchObject({ maxRetries: 2, maxTokens: 2000, timeoutMs: 60_000, schemaName: 'pr_brief' });
    expect(s.provider.complete).not.toHaveBeenCalled();
    expect(s.provider.embed).not.toHaveBeenCalled();
  });

  it('uses the registry default risk_brief model, or the workspace override (AC-25)', async () => {
    const d = setup();
    await gen(d);
    expect(d.llmArgs).toEqual(['openai']);
    expect(d.completeStructured.mock.calls[0]![0]).toMatchObject({ model: 'gpt-4.1' });

    const o = setup({ settings: { risk_brief: { provider: 'anthropic', model: 'claude-x' } } });
    await gen(o);
    expect(o.llmArgs).toEqual(['anthropic']);
    expect(o.completeStructured.mock.calls[0]![0]).toMatchObject({ model: 'claude-x' });
  });

  it('prompt carries no patch text; intent is read, never derived', async () => {
    const s = setup({ files: [{ path: 'src/a.ts', additions: 2, deletions: 1, patch: '@@ -1 +1,2 @@ ctxFn()\n+patchSecret\n-oldSecret' }] });
    await gen(s);
    const msg = userMsg(s);
    for (const x of ['patchSecret', 'oldSecret', 'ctxFn']) expect(msg).not.toContain(x);
    expect(msg).toContain('Do thing');
  });
});

describe('generate: assembly and persistence', () => {
  it('stores head_sha, generation fields, grounded refs, wrapped risks (A5), only Intent fields (A9)', async () => {
    const s = setup();
    const b = await gen(s);
    expect(b.head_sha).toBe('sha-head');
    expect(b.generation).toEqual({ provider: 'openai', model: 'm-actual', tokens_in: 123, tokens_out: 45, cost_usd: 0.01, attempts: 2 });
    expect(b.risks.risks[0]!.file_refs).toEqual(['src/a.ts']);
    expect(b.review_focus).toEqual([{ file: 'src/a.ts', line: 3, reason: 'why' }]);
    expect(Object.keys(b.intent!).sort()).toEqual(['confidence', 'in_scope', 'intent', 'out_of_scope', 'sources']);
    expect(s.getStored()).toEqual(b);
  });

  it('GET after generate returns the stored brief; GET makes 0 LLM calls; unknown PR -> 404', async () => {
    const s = setup();
    const b = await gen(s);
    expect(await s.svc.get('ws', 'pr1')).toEqual(b);
    expect(s.completeStructured).toHaveBeenCalledTimes(1);

    const none = setup();
    await expect(none.svc.get('ws', 'pr1')).rejects.toMatchObject({ code: 'no_brief', statusCode: 404 });
    expect(none.completeStructured).not.toHaveBeenCalled();
    await expect(setup({ pullMissing: true }).svc.get('ws', 'pr1')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('a stored row that fails the contract is treated as no_brief', async () => {
    const s = setup();
    s.setStored({ summary: 'old shape' });
    await expect(s.svc.get('ws', 'pr1')).rejects.toMatchObject({ code: 'no_brief' });
  });

  it('second generate replaces the stored row, 1 call each (AC-9)', async () => {
    const s = setup();
    await gen(s);
    s.completeStructured.mockResolvedValueOnce({ data: draft({ summary: 'second' }), model: 'm', tokensIn: 1, tokensOut: 1, costUsd: null, raw: '', attempts: 1 });
    const b2 = await gen(s);
    expect(s.completeStructured).toHaveBeenCalledTimes(2);
    expect((s.getStored() as PrBrief).summary).toBe('second');
    expect(b2.generation.cost_usd).toBeNull();
  });
});

describe('generate: errors', () => {
  it('0 files -> 422 empty_diff, no LLM call, nothing stored (AC-33)', async () => {
    const s = setup({ files: [] });
    await expect(gen(s)).rejects.toMatchObject({ code: 'empty_diff', statusCode: 422 });
    expect(s.completeStructured).not.toHaveBeenCalled();
    expect(s.store.upsert).not.toHaveBeenCalled();
  });

  it('container.llm throws ConfigError -> 400 provider_not_configured naming Risk Brief, 0 calls (AC-36)', async () => {
    const s = setup({ llmFactory: async () => { throw new ConfigError('no key'); } });
    const err = await gen(s).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'provider_not_configured', statusCode: 400 });
    expect(err.message).toContain('Risk Brief');
    expect(s.completeStructured).not.toHaveBeenCalled();
    expect(s.store.upsert).not.toHaveBeenCalled();
  });

  it('real adapter schema-failure message -> 502 llm_invalid_output; old row preserved byte-equal (AC-10, AC-28)', async () => {
    const s = setup();
    await gen(s);
    const before = JSON.stringify(s.getStored());
    s.completeStructured.mockRejectedValueOnce(new ExternalServiceError('structured output failed schema validation'));
    await expect(gen(s)).rejects.toMatchObject({ code: 'llm_invalid_output', statusCode: 502 });
    expect(JSON.stringify(s.getStored())).toBe(before);
    expect(s.store.upsert).toHaveBeenCalledTimes(1);
  });

  it('other LLM failures -> 502 llm_failed, nothing stored', async () => {
    const s = setup({ completeStructured: async () => { throw new Error('boom 500'); } });
    await expect(gen(s)).rejects.toMatchObject({ code: 'llm_failed', statusCode: 502 });
    expect(s.store.upsert).not.toHaveBeenCalled();
  });
});

describe('generate: scoping and in-flight join (A4, AC-31)', () => {
  it('unknown PR -> 404 before anything else runs', async () => {
    const s = setup({ pullMissing: true });
    await expect(gen(s)).rejects.toBeInstanceOf(NotFoundError);
    expect(s.llmArgs).toEqual([]);
    expect(s.completeStructured).not.toHaveBeenCalled();
  });

  it('two concurrent generates -> 1 LLM call, same object; a later one calls again', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = setup({
      completeStructured: async () => {
        await gate;
        return { data: draft(), model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '', attempts: 1 };
      },
    });
    const p1 = gen(s);
    const p2 = gen(s);
    // let both pass getPull, then release
    await new Promise((r) => setTimeout(r, 10));
    release();
    const [a, b] = await Promise.all([p1, p2]);
    expect(s.completeStructured).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    await gen(s);
    expect(s.completeStructured).toHaveBeenCalledTimes(2);
  });

  it('in-flight entry is cleared after a failure', async () => {
    const s = setup();
    s.completeStructured.mockRejectedValueOnce(new Error('x'));
    await expect(gen(s)).rejects.toBeDefined();
    await expect(gen(s)).resolves.toBeDefined();
  });
});

describe('missing inputs (AC-4, AC-34, AC-35)', () => {
  it('everything present -> []', async () => {
    expect((await gen(setup())).missing_inputs).toEqual([]);
  });
  it('no intent / blast throws / no attached docs / empty body all reported, generation proceeds', async () => {
    const s = setup({ intent: null, blast: 'throws', agents: [], body: '   ' });
    const b = await gen(s);
    expect(b.missing_inputs).toEqual(['intent', 'blast', 'specs', 'description']);
    expect(b.intent).toBeNull();
    expect(b.blast).toBeNull();
    expect(s.completeStructured).toHaveBeenCalledTimes(1);
    expect(userMsg(s)).toContain('intent, blast, specs, description');
  });
  it('index_partial blast is used (not missing) and the message flags it; other degraded reasons are missing', async () => {
    const p = setup({ blast: 'partial' });
    const b = await gen(p);
    expect(b.missing_inputs).not.toContain('blast');
    expect(b.blast).not.toBeNull();
    expect(userMsg(p)).toContain('caller list may be incomplete');

    const f = setup({ blast: 'flag_off' });
    expect((await gen(f)).missing_inputs).toContain('blast');
  });
  it('blast callers extend the grounding allowlist', async () => {
    const s = setup({
      completeStructured: async () => ({
        data: draft({ risks: [{ kind: 'k', title: 'R', explanation: 'e', severity: 'low', file_refs: ['src/caller.ts'] }], review_focus: [{ file: 'src/caller.ts', line: 1, reason: 'r' }] }),
        model: 'm', tokensIn: 1, tokensOut: 1, costUsd: 0, raw: '', attempts: 1,
      }),
    });
    const b = await gen(s);
    expect(b.risks.risks).toHaveLength(1);
    expect(b.review_focus[0]!.line).toBe(40); // snapped to the caller line
  });
});

describe('logging (NFR-4)', () => {
  it('exactly one "brief generated" line with the documented fields and no text leak', async () => {
    const s = setup();
    await gen(s);
    expect(s.log.info).toHaveBeenCalledTimes(1);
    const [obj, msg] = s.log.info.mock.calls[0]!;
    expect(msg).toBe('brief generated');
    expect(obj).toMatchObject({
      prId: 'pr1', provider: 'openai', model: 'gpt-4.1', attempts: 2, tokensIn: 123, tokensOut: 45, costUsd: 0.01,
      outcome: 'ok', missing_inputs: [], dropped: { risks: 0, fileRefs: 1, focus: 0 }, snapped: 0,
    });
    for (const k of ['durationMs', 'estInputTokens', 'truncated']) expect(obj).toHaveProperty(k);
    const line = JSON.stringify(s.log.info.mock.calls);
    for (const secret of [SECRET_BODY, SECRET_SPEC, SECRET_SUMMARY, 'Do thing']) expect(line).not.toContain(secret);
  });

  it('a failed LLM run logs one line with the failure outcome; empty_diff / ConfigError log none', async () => {
    const f = setup();
    f.completeStructured.mockRejectedValueOnce(new ExternalServiceError('structured output failed schema validation'));
    await gen(f).catch(() => {});
    expect(f.log.info).toHaveBeenCalledTimes(1);
    expect(f.log.info.mock.calls[0]![0]).toMatchObject({ outcome: 'llm_invalid_output' });

    const e = setup({ files: [] });
    await gen(e).catch(() => {});
    const c = setup({ llmFactory: async () => { throw new ConfigError('x'); } });
    await gen(c).catch(() => {});
    expect(e.log.info).not.toHaveBeenCalled();
    expect(c.log.info).not.toHaveBeenCalled();
  });
});

describe('best-effort loaders never throw', () => {
  it('loadIntent: throwing repo / unparsable row -> null', async () => {
    expect(await loadIntent({ reviewRepo: { getIntent: async () => { throw new Error('x'); } } } as never, 'p')).toBeNull();
    expect(await loadIntent({ reviewRepo: { getIntent: async () => ({ bogus: 1 }) } } as never, 'p')).toBeNull();
  });
  it('loadBlast: unavailable -> null and logs', async () => {
    const log = { info: vi.fn() };
    expect(await loadBlast({ reviewRepo: { getPull: async () => undefined } } as never, 'ws', 'p', log)).toBeNull();
    expect(log.info).toHaveBeenCalled();
  });
  it('loadSpecs: throwing agents repo -> []; docs keep agent-usage order', async () => {
    expect(await loadSpecs({ agentsRepo: { listEnabled: async () => { throw new Error('x'); } } } as never, 'ws', 'r')).toEqual([]);
    const c = {
      agentsRepo: {
        listEnabled: async () => [{ id: '1', contextPaths: ['docs/b.md', 'docs/a.md'] }, { id: '2', contextPaths: ['docs/b.md'] }],
        linkedSkills: async () => [],
      },
      contextService: {
        readDocs: async (_w: string, _r: string, paths: string[]) => ({ docs: [...paths].reverse().map((p) => ({ path: p, text: p, tokens: 1 })) }),
      },
    };
    expect((await loadSpecs(c as never, 'ws', 'r')).map((d) => d.path)).toEqual(['docs/b.md', 'docs/a.md']);
  });
});

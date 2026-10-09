import { describe, it, expect, vi } from 'vitest';
import { EvalService } from './service.js';
import type { EvalRepository, EvalCaseRow, InsertAgentRun, InsertCaseRun } from './repository.js';
import type { Container } from '../../platform/container.js';

const WS = 'ws';
const AGENT = { id: 'a1', workspaceId: WS, name: 'Sec', provider: 'openrouter', model: 'm', systemPrompt: 'PROMPT-V3', version: 3 };

const caseRow = (name: string, kind: 'must_find' | 'must_not_flag' | 'none', loc?: [string, number, number]): EvalCaseRow => {
  const l = loc && { file: loc[0], start_line: loc[1], end_line: loc[2] };
  return {
    id: `id-${name}`, ownerId: 'a1', name, inputDiff: `diff --git a/${loc?.[0] ?? 'x.ts'} b/${loc?.[0] ?? 'x.ts'}\n+++ b/${loc?.[0] ?? 'x.ts'}\n@@ -1,1 +1,2 @@\n+${name}\n`,
    inputMeta: { title: name }, expectedOutput: { must_find: kind === 'must_find' && l ? [l] : [], must_not_flag: kind === 'must_not_flag' && l ? [l] : [] },
    expectationKind: kind, sourceFindingId: null, notes: null,
  } as unknown as EvalCaseRow;
};

const finding = (file: string, s: number, e = s) => ({ id: 'x', severity: 'WARNING', category: 'bug', title: 't', file, start_line: s, end_line: e, rationale: 'r', confidence: 0.9 });
const outcome = (findings: ReturnType<typeof finding>[], dropped = 0, costUsd: number | null = 0.01) =>
  ({ review: { verdict: 'comment', summary: '', score: 50, findings }, dropped: Array.from({ length: dropped }, () => ({})), costUsd }) as never;

function build(cases: EvalCaseRow[], review: (a: Record<string, unknown>) => Promise<unknown>, opts: { llm?: () => Promise<unknown>; agent?: unknown } = {}) {
  const saved: { run?: InsertAgentRun; cases?: InsertCaseRun[] } = {};
  const repo = {
    getAgent: async () => (opts.agent === null ? undefined : AGENT),
    listCases: async () => cases,
    insertAgentRun: async (run: InsertAgentRun, rows: InsertCaseRun[]) => {
      saved.run = run;
      saved.cases = rows;
      return { id: 'run1', ranAt: new Date(), ...run, costUsd: run.costUsd == null ? null : String(run.costUsd) };
    },
    caseRunsOf: async () => [],
  } as unknown as EvalRepository;
  const container = {
    llm: opts.llm ?? (async () => ({ id: 'openrouter' })),
    agentsRepo: { linkedSkills: async () => [] },
  } as unknown as Container;
  return { service: new EvalService(container, repo, { review: review as never }), saved };
}

describe('EvalService.runAgent', () => {
  it('feeds each case only its stored diff, snapshots prompt + version, scores by code (AC-9…AC-11)', async () => {
    const cases = [caseRow('a', 'must_find', ['a.ts', 1, 1]), caseRow('b', 'must_not_flag', ['b.ts', 1, 1]), caseRow('c', 'none')];
    const seen: Array<{ diff: { raw: string }; systemPrompt: string; strategy: string }> = [];
    const { service, saved } = build(cases, async (a) => {
      seen.push(a as never);
      const raw = (a as { diff: { raw: string } }).diff.raw;
      if (raw.includes('+a')) return outcome([finding('a.ts', 1)]); // finds the expected one
      if (raw.includes('+b')) return outcome([finding('b.ts', 1), finding('b.ts', 1)], 1); // re-flags the dismissed one
      return outcome([]); // clean
    });
    const run = await service.runAgent(WS, 'a1');

    expect(seen.map((s) => s.systemPrompt)).toEqual(['PROMPT-V3', 'PROMPT-V3', 'PROMPT-V3']);
    expect(new Set(seen.map((s) => s.strategy))).toEqual(new Set(['single-pass']));
    expect(seen.find((s) => s.diff.raw.includes('+a'))!.diff.raw).toBe(cases[0]!.inputDiff);
    expect(saved.run).toMatchObject({ agentVersion: 3, systemPrompt: 'PROMPT-V3', tracesTotal: 3, tracesPassed: 2 });
    // recall 1/1; precision (1 + 2 + 0 − 2 noise) / 3 findings; citation 3 grounded / 4 produced
    expect(run.recall).toBe(1);
    expect(run.precision).toBeCloseTo(1 / 3);
    expect(run.citation_accuracy).toBeCloseTo(3 / 4);
    expect(run.agent_version).toBe(3);
    expect(saved.cases!.map((c) => [c.status, c.pass])).toEqual([['ok', true], ['ok', false], ['ok', true]]);
  });

  it('an empty case set is a validation error and creates nothing (AC-12)', async () => {
    const { service, saved } = build([], async () => outcome([]));
    await expect(service.runAgent(WS, 'a1')).rejects.toMatchObject({ statusCode: 422 });
    expect(saved.run).toBeUndefined();
  });

  it('one failing case is marked error, the rest still score and the error is excluded from metrics (AC-13)', async () => {
    const cases = [caseRow('ok', 'must_find', ['a.ts', 1, 1]), caseRow('boom', 'must_find', ['b.ts', 1, 1])];
    const { service, saved } = build(cases, async (a) => {
      if ((a as { diff: { raw: string } }).diff.raw.includes('+boom')) throw new Error('llm exploded');
      return outcome([finding('a.ts', 1)]);
    });
    const run = await service.runAgent(WS, 'a1');
    const bad = saved.cases!.find((c) => c.status === 'error')!;
    expect(bad.pass).toBeNull();
    expect((bad.actualOutput as { error: string }).error).toContain('llm exploded');
    expect(run.recall).toBe(1); // only the ok case counts
    expect(saved.run).toMatchObject({ tracesTotal: 2, tracesPassed: 1 });
  });

  it('rejects a second concurrent run for the same agent (AC-13a), then allows one after it finishes', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { service } = build([caseRow('a', 'none')], async () => {
      await gate;
      return outcome([]);
    });
    const first = service.runAgent(WS, 'a1');
    await vi.waitFor(async () => {
      await expect(service.runAgent(WS, 'a1')).rejects.toMatchObject({ code: 'eval_running', statusCode: 409 });
    });
    release();
    await first;
    await expect(service.runAgent(WS, 'a1')).resolves.toBeDefined();
  });

  it('a missing provider fails before any row is written (E11)', async () => {
    const { service, saved } = build([caseRow('a', 'none')], async () => outcome([]), {
      llm: async () => {
        throw new Error('openrouter key not configured');
      },
    });
    await expect(service.runAgent(WS, 'a1')).rejects.toThrow('not configured');
    expect(saved.run).toBeUndefined();
  });

  it('runs only the requested case ids', async () => {
    const calls: string[] = [];
    const { service, saved } = build([caseRow('a', 'none'), caseRow('b', 'none')], async (a) => {
      calls.push((a as { diff: { raw: string } }).diff.raw);
      return outcome([]);
    });
    await service.runAgent(WS, 'a1', ['id-b']);
    expect(calls).toHaveLength(1);
    expect(saved.run!.tracesTotal).toBe(1);
  });
});

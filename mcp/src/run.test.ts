import { describe, expect, it, vi } from 'vitest';
import type { ReviewDto } from '@devdigest/shared';
import { ToolError } from './api.js';
import { startAndWait, type RunDeps } from './run.js';

const PR = 'pr-1';
const AGENT = { id: 'agent-1', name: 'Sec' };
const REVIEW = { run_id: 'run-1', findings: [] } as unknown as ReviewDto;

/**
 * Fake API: routes by "METHOD path". `statuses` is consumed one per GET /runs/:id.
 * Clock advances by the slept amount, so a 120 s wait runs instantly.
 */
function harness(opts: { active?: { run_id: string; agent_id: string }[]; statuses: (string | Error)[] }) {
  let clock = 0;
  const calls: string[] = [];
  const statuses = [...opts.statuses];
  const api = vi.fn(async (path: string, init?: { method?: string }) => {
    const key = `${init?.method ?? 'GET'} ${path}`;
    calls.push(key);
    if (key === `GET /pulls/${PR}/runs/active`) return opts.active ?? [];
    if (key === `POST /pulls/${PR}/review`) return { runs: [{ run_id: 'run-1' }] };
    if (key.startsWith('GET /runs/')) {
      const next = statuses.length > 1 ? statuses.shift()! : statuses[0]!;
      if (next instanceof Error) throw next;
      return { run_id: 'run-1', status: next, error: next === 'failed' ? 'LLM exploded' : null };
    }
    if (key === `GET /pulls/${PR}/reviews`) return [REVIEW];
    if (key.endsWith('/cancel')) return { ok: true };
    throw new Error(`unexpected ${key}`);
  });
  const deps: RunDeps = {
    api: api as unknown as RunDeps['api'],
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
  return { deps, calls };
}

const input = (over: Partial<Parameters<typeof startAndWait>[1]> = {}) => ({
  prId: PR,
  agent: AGENT,
  timeoutMs: 120_000,
  signal: new AbortController().signal,
  ...over,
});

describe('startAndWait', () => {
  it('starts a run, polls until done, returns the review', async () => {
    const { deps, calls } = harness({ statuses: ['running', 'running', 'done'] });
    const onProgress = vi.fn();
    const out = await startAndWait(deps, input({ onProgress }));
    expect(out).toEqual({ status: 'done', runId: 'run-1', attached: false, review: REVIEW });
    expect(calls).toContain(`POST /pulls/${PR}/review`);
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenLastCalledWith(3, 120);
  });

  it('throws an actionable error when the run fails', async () => {
    const { deps } = harness({ statuses: ['failed'] });
    await expect(startAndWait(deps, input())).rejects.toThrow('Review failed: LLM exploded');
  });

  it('on timeout returns running + run_id and does NOT cancel', async () => {
    const { deps, calls } = harness({ statuses: ['running'] });
    const out = await startAndWait(deps, input());
    expect(out).toMatchObject({ status: 'running', runId: 'run-1', elapsedSec: 120 });
    expect(calls.some((c) => c.endsWith('/cancel'))).toBe(false);
  });

  it('attaches to an in-flight run of the same agent instead of starting another', async () => {
    const { deps, calls } = harness({ active: [{ run_id: 'run-1', agent_id: AGENT.id }], statuses: ['done'] });
    const out = await startAndWait(deps, input());
    expect(out).toMatchObject({ status: 'done', attached: true });
    expect(calls.some((c) => c.startsWith('POST /pulls/'))).toBe(false);
  });

  it('abort cancels a run we started', async () => {
    const { deps, calls } = harness({ statuses: ['running'] });
    const ctrl = new AbortController();
    deps.sleep = async () => ctrl.abort();
    const out = await startAndWait(deps, input({ signal: ctrl.signal }));
    expect(out).toEqual({ status: 'cancelled', runId: 'run-1' });
    expect(calls).toContain('POST /runs/run-1/cancel');
  });

  it('abort never cancels an attached run', async () => {
    const { deps, calls } = harness({ active: [{ run_id: 'run-1', agent_id: AGENT.id }], statuses: ['running'] });
    const ctrl = new AbortController();
    deps.sleep = async () => ctrl.abort();
    await startAndWait(deps, input({ signal: ctrl.signal }));
    expect(calls.some((c) => c.endsWith('/cancel'))).toBe(false);
  });

  it('backs off on 429 and keeps polling', async () => {
    const { deps } = harness({ statuses: [new ToolError('rate limited', 429, 5000), 'done'] });
    const out = await startAndWait(deps, input());
    expect(out.status).toBe('done');
    expect(deps.now()).toBe(5000);
  });
});

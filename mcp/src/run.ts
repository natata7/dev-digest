import type { Agent, ReviewDto, RunDetail } from '@devdigest/shared';
import { ToolError, type api } from './api.js';

/**
 * APPLICATION — "run one agent on a PR and wait for its findings".
 * Pure orchestration: every side effect (HTTP, clock, sleeping) is injected via
 * `deps`, so tests drive it with fakes and no global mocks. Only `ToolError`
 * (a plain class) and types come from api.ts.
 */

export interface RunDeps {
  api: typeof api;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  now: () => number;
}

export type RunOutcome =
  | { status: 'done'; runId: string; attached: boolean; review: ReviewDto }
  | { status: 'running'; runId: string; attached: boolean; elapsedSec: number }
  | { status: 'cancelled'; runId: string };

export interface RunInput {
  prId: string;
  agent: Pick<Agent, 'id' | 'name'>;
  timeoutMs: number;
  pollMs?: number;
  signal: AbortSignal;
  onProgress?: (elapsedSec: number, totalSec: number) => void;
}

/** Abortable sleep: resolves early (never rejects) when `signal` aborts. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

export async function startAndWait(deps: RunDeps, input: RunInput): Promise<RunOutcome> {
  const { api } = deps;
  const { prId, agent, timeoutMs, signal } = input;
  const pollMs = input.pollMs ?? 3000;
  const start = deps.now();

  // Dedupe: attach to an in-flight run of the same agent instead of paying twice.
  // ponytail: small race between this check and the POST — acceptable locally.
  const active = await api<{ run_id: string; agent_id: string | null }[]>(`/pulls/${prId}/runs/active`);
  const existing = active.find((r) => r.agent_id === agent.id);
  let runId: string;
  const attached = existing !== undefined;
  if (existing) {
    runId = existing.run_id;
  } else {
    const res = await api<{ runs: { run_id: string }[] }>(`/pulls/${prId}/review`, {
      method: 'POST',
      body: { agentId: agent.id },
    });
    const first = res.runs[0];
    if (!first) throw new ToolError(`DevDigest started no run for agent ${agent.name}.`);
    runId = first.run_id;
  }

  for (;;) {
    if (signal.aborted) {
      // Only cancel what we started — an attached run belongs to someone else (e.g. the UI).
      if (!attached) await api(`/runs/${runId}/cancel`, { method: 'POST' }).catch(() => undefined);
      return { status: 'cancelled', runId };
    }

    let run: RunDetail | undefined;
    let waitMs = pollMs;
    try {
      run = await api<RunDetail>(`/runs/${runId}`);
    } catch (err) {
      if (!(err instanceof ToolError) || err.status !== 429) throw err;
      waitMs = err.retryAfterMs ?? pollMs;
    }

    if (run?.status === 'done') {
      // Findings are persisted before the run is marked done (run-executor.ts),
      // so the review is guaranteed to be there now.
      const reviews = await api<ReviewDto[]>(`/pulls/${prId}/reviews`);
      const review = reviews.find((r) => r.run_id === runId);
      if (!review) throw new ToolError(`Run ${runId} finished but its review was not found (was it deleted?).`);
      return { status: 'done', runId, attached, review };
    }
    if (run?.status === 'failed') throw new ToolError(`Review failed: ${run.error ?? 'unknown error'}`);
    if (run?.status === 'cancelled') throw new ToolError(`Review run ${runId} was cancelled.`);

    const elapsedMs = deps.now() - start;
    const elapsedSec = Math.round(elapsedMs / 1000);
    if (elapsedMs >= timeoutMs) return { status: 'running', runId, attached, elapsedSec };
    input.onProgress?.(elapsedSec, Math.round(timeoutMs / 1000));
    await deps.sleep(Math.min(waitMs, timeoutMs - elapsedMs), signal);
  }
}

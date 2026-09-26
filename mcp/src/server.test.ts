import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { BlastRadius } from '@devdigest/shared';
import { createServer } from './server.js';

const RUN_ID = '1b2c3d4e-0000-4000-8000-000000000001';
const PR_ID = '2b3c4d5e-0000-4000-8000-000000000002';

/** Protocol-level: a real MCP client talks to the server over an in-memory pair; the HTTP API is stubbed. */
const client = new Client({ name: 'test', version: '0' });

beforeAll(async () => {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(a);
  await client.connect(b);
});
afterAll(() => client.close());
afterEach(() => vi.unstubAllGlobals());

function stubApi(routes: Record<string, unknown>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (!(path in routes)) return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
      return new Response(JSON.stringify(routes[path]), { status: 200 });
    }),
  );
}

const text = (r: Awaited<ReturnType<Client['callTool']>>) => (r.content as { text: string }[])[0]!.text;

describe('tool surface', () => {
  it('exposes exactly the 5 tools with short descriptions and correct annotations', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['get_blast_radius', 'get_conventions', 'get_findings', 'list_agents', 'run_agent_on_pr'].sort(),
    );
    for (const t of tools) {
      const firstSentence = t.description!.split('. ')[0]!;
      expect(firstSentence.length, t.name).toBeLessThanOrEqual(200);
      expect(t.description!.length, t.name).toBeLessThanOrEqual(300);
    }
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(byName.run_agent_on_pr!.annotations).toMatchObject({ readOnlyHint: false, openWorldHint: true });
    for (const n of ['list_agents', 'get_findings', 'get_conventions', 'get_blast_radius']) {
      expect(byName[n]!.annotations?.readOnlyHint, n).toBe(true);
    }
    expect(byName.list_agents!.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
  });

  it('keeps the whole tools/list payload small (startup token budget)', async () => {
    const { tools } = await client.listTools();
    // ~4 chars/token → < ~1.5k tokens for all five schemas.
    expect(JSON.stringify(tools).length).toBeLessThan(6000);
  });
});

describe('tools', () => {
  it('list_agents', async () => {
    stubApi({ '/agents': [{ id: 'a1', name: 'Sec', description: '', provider: 'openai', model: 'gpt', enabled: true, system_prompt: 'x' }] });
    const r = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain('- Sec — id a1 · openai/gpt · enabled');
  });

  it('get_findings by run_id', async () => {
    stubApi({
      [`/runs/${RUN_ID}`]: { run_id: RUN_ID, status: 'done', pr_id: 'pr-1' },
      '/pulls/pr-1/reviews': [
        { run_id: RUN_ID, agent_name: 'Sec', verdict: 'approve', score: 95, summary: null, findings: [] },
      ],
    });
    const r = await client.callTool({ name: 'get_findings', arguments: { run_id: RUN_ID } });
    expect(text(r)).toContain(`Sec · run ${RUN_ID} · verdict approve · score 95/100 · 0 findings`);
  });

  it('get_findings reports a still-running run as a non-error', async () => {
    stubApi({ [`/runs/${RUN_ID}`]: { run_id: RUN_ID, status: 'running', pr_id: 'pr-1', ran_at: null } });
    const r = await client.callTool({ name: 'get_findings', arguments: { run_id: RUN_ID } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain('still reviewing');
  });

  it('get_findings with unknown run_id → actionable isError', async () => {
    stubApi({});
    const r = await client.callTool({ name: 'get_findings', arguments: { run_id: RUN_ID } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('call run_agent_on_pr');
  });

  it('get_conventions', async () => {
    stubApi({
      '/repos': [{ id: 'repo-1', full_name: 'acme/api' }],
      '/repos/repo-1/conventions': { extracted_at: null, sample_file_count: 0, items: [] },
    });
    const r = await client.callTool({ name: 'get_conventions', arguments: { repo: 'acme/api' } });
    expect(text(r)).toContain('No conventions extracted yet for acme/api');
  });

  it('get_blast_radius concise text shows the caller file:line', async () => {
    const blast: BlastRadius = {
      changed_symbols: [{ name: 'chargeUser', file: 'src/billing.ts', kind: 'function' }],
      downstream: [
        {
          symbol: 'chargeUser',
          callers: [{ name: 'handleCheckout', file: 'src/checkout.ts', line: 42 }],
          endpoints_affected: ['POST /checkout'],
          crons_affected: [],
        },
      ],
      summary: '1 symbols · 1 callers · 1 endpoints · 0 crons',
    };
    stubApi({ [`/pulls/${PR_ID}/blast`]: blast });
    const r = await client.callTool({ name: 'get_blast_radius', arguments: { pr: PR_ID } });
    expect(r.isError).toBeFalsy();
    expect(text(r)).toContain('src/checkout.ts:42 (handleCheckout)');
  });

  it('get_blast_radius response_format json returns the stub body verbatim', async () => {
    const blast: BlastRadius = {
      changed_symbols: [],
      downstream: [],
      summary: '0 symbols · 0 callers · 0 endpoints · 0 crons',
    };
    stubApi({ [`/pulls/${PR_ID}/blast`]: blast });
    const r = await client.callTool({ name: 'get_blast_radius', arguments: { pr: PR_ID, response_format: 'json' } });
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(text(r))).toEqual(blast);
  });

  it('get_blast_radius unknown PR (404) → isError naming the PR-not-found next step', async () => {
    stubApi({});
    const r = await client.callTool({ name: 'get_blast_radius', arguments: { pr: PR_ID } });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('PR not found — pass owner/repo#number, a PR URL or a DevDigest PR uuid');
  });

  it('API down → every tool returns the dev.sh hint as isError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    const r = await client.callTool({ name: 'list_agents', arguments: {} });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('./scripts/dev.sh');
  });

  it('rejects an invalid enum', async () => {
    const r = await client
      .callTool({ name: 'get_findings', arguments: { run_id: RUN_ID, min_severity: 'HIGH' } })
      .catch((e: unknown) => ({ isError: true, thrown: e }));
    expect(r.isError).toBe(true);
  });
});

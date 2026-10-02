import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToolError, api, parsePrRef, resolveAgent, resolvePr } from './api.js';

const UUID = '7d6c1a2b-0000-4000-8000-000000000001';

/** Stub global fetch with a path → [status, body] table. */
function stubFetch(routes: Record<string, [number, unknown]>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      const hit = routes[path];
      if (!hit) throw new Error(`unexpected ${path}`);
      const [status, body] = hit;
      return new Response(JSON.stringify(body), { status, headers: { 'retry-after': '7' } });
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('parsePrRef', () => {
  it('accepts owner/repo#n, PR URLs and uuids', () => {
    expect(parsePrRef('acme/payments-api#482')).toEqual({ fullName: 'acme/payments-api', number: 482 });
    expect(parsePrRef('https://github.com/acme/payments-api/pull/482/files')).toEqual({
      fullName: 'acme/payments-api',
      number: 482,
    });
    expect(parsePrRef(UUID)).toEqual({ prId: UUID });
  });

  it('rejects junk with a hint', () => {
    expect(() => parsePrRef('PR 482')).toThrow(/owner\/repo#123/);
  });
});

describe('resolvePr', () => {
  it('resolves a ref through /repos and /repos/:id/pulls', async () => {
    stubFetch({
      '/repos': [200, [{ id: 'repo-1', full_name: 'Acme/Payments-API' }]],
      '/repos/repo-1/pulls': [200, [{ id: 'pr-1', number: 482 }]],
    });
    await expect(resolvePr('acme/payments-api#482')).resolves.toEqual({ id: 'pr-1', label: 'Acme/Payments-API#482' });
  });

  it('explains a repo that is not imported, and a missing PR number', async () => {
    stubFetch({ '/repos': [200, [{ id: 'repo-1', full_name: 'acme/api' }]], '/repos/repo-1/pulls': [200, []] });
    await expect(resolvePr('acme/other#1')).rejects.toThrow('is not imported in DevDigest');
    await expect(resolvePr('acme/api#9')).rejects.toThrow('PR #9 not found in acme/api');
  });
});

describe('resolveAgent', () => {
  it('matches by id or case-insensitive name, else points to list_agents', async () => {
    stubFetch({ '/agents': [200, [{ id: 'a1', name: 'Security Reviewer' }]] });
    await expect(resolveAgent('a1')).resolves.toMatchObject({ id: 'a1' });
    await expect(resolveAgent('security reviewer')).resolves.toMatchObject({ id: 'a1' });
    await expect(resolveAgent('nope')).rejects.toThrow('call list_agents');
  });
});

describe('api error mapping', () => {
  it('unreachable API → start-the-stack hint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));
    await expect(api('/agents')).rejects.toThrow('./scripts/dev.sh');
  });

  it('429 carries status and retry-after', async () => {
    stubFetch({ '/agents': [429, {}] });
    const err = await api('/agents').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ToolError);
    expect(err).toMatchObject({ status: 429, retryAfterMs: 7000 });
  });

  it('5xx surfaces the server message, no stack', async () => {
    stubFetch({ '/agents': [500, { error: { code: 'x', message: 'No system user found — run pnpm db:seed' } }] });
    const err = (await api('/agents').catch((e: unknown) => e)) as ToolError;
    expect(err.message).toBe('DevDigest API 500: No system user found — run pnpm db:seed');
    expect(err.status).toBe(500);
  });
});

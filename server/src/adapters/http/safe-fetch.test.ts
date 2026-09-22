import { describe, it, expect } from 'vitest';
import { assertSafeUrl, safeFetchBytes } from './safe-fetch.js';
import { SkillImportError } from '../../modules/skills/import.js';

describe('assertSafeUrl', () => {
  const rejects = [
    ['non-https scheme', 'http://example.com'],
    ['non-http(s) scheme', 'file:///etc/passwd'],
    ['loopback literal IP', 'https://127.0.0.1'],
    ['cloud metadata IP', 'https://169.254.169.254/latest/meta-data/'],
    ['loopback IPv6', 'https://[::1]/'],
    ['private class-A literal IP', 'https://10.0.0.5'],
    ['embedded credentials', 'https://user:pass@example.com'],
    ['.localhost suffix', 'https://foo.localhost'],
  ] as const;

  it.each(rejects)('rejects %s (%s)', (_label, url) => {
    expect(() => assertSafeUrl(url)).toThrow(SkillImportError);
  });

  it('accepts an ordinary public https URL', () => {
    const url = assertSafeUrl('https://raw.githubusercontent.com/foo/bar/main/SKILL.md');
    expect(url.hostname).toBe('raw.githubusercontent.com');
  });
});

// TEST-NET-3 (203.0.113.0/24, RFC 5737) — reserved for documentation, not in
// our private-range blocklist, and `dns.lookup` never hits the network for a
// literal IP, so this stays hermetic (no real DNS/socket).
const PUBLIC_TEST_IP = '203.0.113.10';

function jsonHeaders(extra: Record<string, string> = {}) {
  return new Headers({ 'content-type': 'text/markdown', ...extra });
}

describe('safeFetchBytes', () => {
  it('reads bytes and derives filename from the URL path', async () => {
    const fetchImpl = (async () =>
      new Response(new TextEncoder().encode('# hi'), { status: 200, headers: jsonHeaders() })) as unknown as typeof fetch;

    const result = await safeFetchBytes(new URL(`https://${PUBLIC_TEST_IP}/skills/SKILL.md`), {
      fetchImpl,
      timeoutMs: 1000,
      maxBytes: 1024,
      maxRedirects: 3,
    });
    expect(new TextDecoder().decode(result.bytes)).toBe('# hi');
    expect(result.filename).toBe('SKILL.md');
  });

  it('follows a redirect, re-validating the new URL, and rejects a redirect into a private IP', async () => {
    let calls = 0;
    const fetchImpl = (async (input: string | URL) => {
      calls++;
      const url = String(input);
      if (url.includes(PUBLIC_TEST_IP)) {
        return new Response(null, { status: 302, headers: jsonHeaders({ location: 'https://127.0.0.1/evil.md' }) });
      }
      throw new Error('unexpected fetch to ' + url);
    }) as unknown as typeof fetch;

    await expect(
      safeFetchBytes(new URL(`https://${PUBLIC_TEST_IP}/redir`), {
        fetchImpl,
        timeoutMs: 1000,
        maxBytes: 1024,
        maxRedirects: 3,
      }),
    ).rejects.toThrow(SkillImportError);
    expect(calls).toBe(1);
  });

  it('aborts once the response exceeds maxBytes, without buffering the whole body', async () => {
    const big = new Uint8Array(2048).fill(65);
    const fetchImpl = (async () => new Response(big, { status: 200, headers: jsonHeaders() })) as unknown as typeof fetch;

    await expect(
      safeFetchBytes(new URL(`https://${PUBLIC_TEST_IP}/big.md`), {
        fetchImpl,
        timeoutMs: 1000,
        maxBytes: 100,
        maxRedirects: 3,
      }),
    ).rejects.toThrow(SkillImportError);
  });

  it('gives up after maxRedirects hops', async () => {
    const fetchImpl = (async () =>
      new Response(null, { status: 302, headers: jsonHeaders({ location: `https://${PUBLIC_TEST_IP}/again` }) })) as unknown as typeof fetch;

    await expect(
      safeFetchBytes(new URL(`https://${PUBLIC_TEST_IP}/loop`), {
        fetchImpl,
        timeoutMs: 1000,
        maxBytes: 1024,
        maxRedirects: 1,
      }),
    ).rejects.toThrow(SkillImportError);
  });
});

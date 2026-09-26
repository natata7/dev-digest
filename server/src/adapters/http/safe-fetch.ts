import { BlockList, isIPv4, isIPv6 } from 'node:net';
import { promises as dns } from 'node:dns';
import { SkillImportError } from '../../modules/skills/import.js';
import { ALLOWED_IMPORT_PROTOCOLS } from '../../modules/skills/constants.js';

/**
 * SSRF-safe URL fetcher — the only place in this codebase that fetches a URL an
 * attacker (a skill-import author) can influence. https-only, blocks
 * private/loopback/link-local/metadata/CGNAT ranges by literal IP AND by DNS
 * resolution, re-validates every redirect hop, and caps response bytes as they
 * stream in. Single consumer (skills import-from-url) — no port interface, no
 * container getter (see onion-architecture: infrastructure with one caller
 * doesn't need a seam).
 */

const RESERVED_HOSTNAME_SUFFIXES = ['.localhost', '.internal', '.local'];
const RESERVED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

const PRIVATE_V4_SUBNETS: Array<[string, number]> = [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['169.254.0.0', 16], // covers the cloud metadata IP 169.254.169.254
  ['0.0.0.0', 8],
  ['100.64.0.0', 10], // CGNAT
];
const PRIVATE_V6_SUBNETS: Array<[string, number]> = [
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
];

function buildBlockList(subnets: Array<[string, number]>, family: 'ipv4' | 'ipv6'): BlockList {
  const bl = new BlockList();
  for (const [addr, prefix] of subnets) bl.addSubnet(addr, prefix, family);
  return bl;
}
const V4_BLOCKLIST = buildBlockList(PRIVATE_V4_SUBNETS, 'ipv4');
const V6_BLOCKLIST = buildBlockList(PRIVATE_V6_SUBNETS, 'ipv6');

const IPV4_MAPPED = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;

/** Shared pure predicate: is this literal IP address private/reserved? Used by
 *  both the sync (`assertSafeUrl`) and DNS-based (`assertPublicHost`) checks. */
export function isPrivateAddress(ip: string): boolean {
  if (isIPv4(ip)) return V4_BLOCKLIST.check(ip, 'ipv4');
  if (isIPv6(ip)) {
    const mapped = IPV4_MAPPED.exec(ip);
    if (mapped) return V4_BLOCKLIST.check(mapped[1]!, 'ipv4');
    return V6_BLOCKLIST.check(ip, 'ipv6');
  }
  return false;
}

/** `URL.hostname` keeps the `[...]` brackets for an IPv6 literal — strip them
 *  before any IP-literal or DNS check (both `net.isIP*` and `dns.lookup`
 *  expect the bare address). */
function unbracket(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function isReservedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (RESERVED_HOSTNAMES.has(h)) return true;
  return RESERVED_HOSTNAME_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

/** Pure, synchronous URL gate: protocol, credentials, literal-IP and reserved
 *  hostnames. Does NOT resolve DNS — pair with `assertPublicHost` before any
 *  actual network call. Throws `SkillImportError` (→ 400) on every reject. */
export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SkillImportError('Invalid URL');
  }
  if (!(ALLOWED_IMPORT_PROTOCOLS as readonly string[]).includes(url.protocol)) {
    throw new SkillImportError('Only https:// URLs are allowed');
  }
  if (url.username || url.password) {
    throw new SkillImportError('URLs with embedded credentials are not allowed');
  }
  const hostname = unbracket(url.hostname);
  if (isReservedHostname(hostname)) {
    throw new SkillImportError('URL host is not allowed', { hostname });
  }
  if ((isIPv4(hostname) || isIPv6(hostname)) && isPrivateAddress(hostname)) {
    throw new SkillImportError('URL resolves to a private/reserved address', { hostname });
  }
  return url;
}

/**
 * DNS-based check: reject if ANY address `hostname` resolves to is private.
 *
 * ponytail: this is resolve-then-connect, not resolve-and-pin — a DNS answer
 * could change between this check and the actual `fetch()` a few lines later
 * (DNS-rebinding TOCTOU). Not closed in this bonus-scope feature; the upgrade
 * path is pinning the validated IP via an undici `connect` hook so the socket
 * dials the checked address, not a fresh lookup.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
  const host = unbracket(hostname);
  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(host, { all: true });
  } catch {
    throw new SkillImportError('Could not resolve host', { hostname });
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new SkillImportError('URL resolves to a private/reserved address', { hostname });
  }
}

function filenameFromResponse(res: Response, url: URL): string {
  const cd = res.headers.get('content-disposition');
  if (cd) {
    const match = /filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i.exec(cd);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1].trim());
      } catch {
        return match[1].trim();
      }
    }
  }
  const base = url.pathname.split('/').filter(Boolean).pop();
  return base || 'SKILL.md';
}

/** Read the body streamed, aborting as soon as `maxBytes` is exceeded — never
 *  trusts `Content-Length` alone (it can be absent, wrong, or chunked). */
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) {
      throw new SkillImportError('Response exceeds size limit', { max: maxBytes });
    }
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new SkillImportError('Response exceeds size limit', { max: maxBytes });
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export interface SafeFetchOptions {
  /** Defaults to the global `fetch` — inject a stub in tests, never a real socket. */
  fetchImpl?: typeof fetch;
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
}

/**
 * Fetch `url`'s bytes with manual redirect handling: every hop (including the
 * first) is re-validated with `assertSafeUrl` + `assertPublicHost` before any
 * request is made against it.
 */
export async function safeFetchBytes(
  url: URL,
  opts: SafeFetchOptions,
): Promise<{ bytes: Uint8Array; filename: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  let current = url;

  for (let hop = 0; ; hop++) {
    assertSafeUrl(current.href);
    await assertPublicHost(current.hostname);

    let res: Response;
    try {
      res = await fetchImpl(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (err) {
      throw new SkillImportError('Could not fetch URL', { message: (err as Error).message });
    }

    if (res.status >= 300 && res.status < 400) {
      if (hop >= opts.maxRedirects) {
        throw new SkillImportError('Too many redirects');
      }
      const location = res.headers.get('location');
      if (!location) throw new SkillImportError('Redirect response had no Location header');
      current = new URL(location, current);
      continue;
    }

    if (!res.ok) {
      throw new SkillImportError('Fetch failed', { status: res.status });
    }

    const bytes = await readCapped(res, opts.maxBytes);
    return { bytes, filename: filenameFromResponse(res, current) };
  }
}

import type { Agent, PrMeta, Repo } from '@devdigest/shared';

/**
 * INFRASTRUCTURE — the only file that talks to the DevDigest HTTP API.
 * Every failure becomes a ToolError whose message is safe and actionable for
 * the model (no stacks); server.ts turns it into an `isError` tool result.
 */

export const API_URL = (process.env.DEVDIGEST_API_URL ?? 'http://localhost:3001').replace(/\/+$/, '');
const REQUEST_TIMEOUT_MS = 10_000;

export class ToolError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: 'GET' | 'POST'; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method: init.method ?? 'GET',
      ...(init.body !== undefined
        ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }
        : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') {
      throw new ToolError(`DevDigest API did not answer within ${REQUEST_TIMEOUT_MS / 1000} s (${path}).`);
    }
    throw new ToolError(`DevDigest API unreachable at ${API_URL}. Start it with ./scripts/dev.sh.`);
  }
  if (res.ok) return (await res.json()) as T;

  // Server error body is { error: { code, message } } (platform.ts ApiErrorBody).
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  const message = body?.error?.message ?? res.statusText;
  if (res.status === 429) {
    const retryAfterSec = Number(res.headers.get('retry-after'));
    throw new ToolError(
      'Rate limited by the DevDigest API (10 reviews/min, 120 requests/min) — wait a minute and retry.',
      429,
      Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : undefined,
    );
  }
  if (res.status === 422) throw new ToolError(`Invalid input for ${path}: ${message}`, 422);
  throw new ToolError(`DevDigest API ${res.status}: ${message}`, res.status);
}

// ---- human-friendly refs → DevDigest ids ------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PrRef = { prId: string } | { fullName: string; number: number };

/** 'owner/repo#123' | '…/owner/repo/pull/123' URL | DevDigest PR uuid. */
export function parsePrRef(ref: string): PrRef {
  const s = ref.trim();
  if (UUID.test(s)) return { prId: s };
  const m = s.match(/^([\w.-]+)\/([\w.-]+)#(\d+)$/) ?? s.match(/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)/);
  if (m) return { fullName: `${m[1]}/${m[2]}`, number: Number(m[3]) };
  throw new ToolError(`Unrecognised PR ref '${ref}'. Use 'owner/repo#123', a PR URL, or a DevDigest PR uuid.`);
}

export async function resolveRepo(ref: string): Promise<Repo> {
  const s = ref.trim();
  const repos = await api<Repo[]>('/repos');
  const repo = UUID.test(s)
    ? repos.find((r) => r.id === s)
    : repos.find((r) => r.full_name.toLowerCase() === s.toLowerCase());
  if (!repo) {
    throw new ToolError(`Repo '${ref}' is not imported in DevDigest — add it in the UI (localhost:3000).`);
  }
  return repo;
}

/** Resolves a PR ref to its DevDigest id plus a readable label for output. */
export async function resolvePr(ref: string): Promise<{ id: string; label: string }> {
  const parsed = parsePrRef(ref);
  if ('prId' in parsed) return { id: parsed.prId, label: parsed.prId };
  const repo = await resolveRepo(parsed.fullName);
  // ponytail: /repos/:id/pulls also syncs from GitHub on every call (slow-ish);
  // a DB-only /repos/:id/pulls/by-number/:n if lookups get hot.
  const pulls = await api<PrMeta[]>(`/repos/${repo.id}/pulls`);
  const pr = pulls.find((p) => p.number === parsed.number);
  if (!pr?.id) throw new ToolError(`PR #${parsed.number} not found in ${repo.full_name}.`);
  return { id: pr.id, label: `${repo.full_name}#${pr.number}` };
}

/** Agent by exact id or case-insensitive name — never forwards raw input to the API. */
export async function resolveAgent(idOrName: string): Promise<Agent> {
  const s = idOrName.trim();
  const agents = await api<Agent[]>('/agents');
  const agent = agents.find((a) => a.id === s) ?? agents.find((a) => a.name.toLowerCase() === s.toLowerCase());
  if (!agent) throw new ToolError(`Unknown agent '${idOrName}' — call list_agents for valid ids.`);
  return agent;
}

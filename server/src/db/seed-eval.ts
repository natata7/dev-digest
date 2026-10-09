import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from './client.js';
import * as t from './schema.js';

/**
 * Gold set for the built-in Security Reviewer (eval pipeline demo).
 * Diffs are tiny and self-contained; every expected range sits on a line that
 * is inside the diff (added or context), so the grounding gate can accept it.
 * Secrets below are obviously fake placeholders. Ranges span the changed line plus its
 * neighbours: models are often off by a line, and a human marking a finding would too.
 */
interface SeedCase {
  name: string;
  title: string;
  file: string;
  /** New-side line number of the first diff line. */
  start: number;
  /** Diff body lines, each prefixed with ' ' (context) or '+' (added). */
  lines: string[];
  /** Expected range as [first, last] indexes into `lines` (0-based). `null` = clean case. */
  at: [number, number] | null;
  kind: 'must_find' | 'must_not_flag' | 'none';
  severity?: string;
  category?: string;
}

export const EVAL_SEED_CASES: SeedCase[] = [
  {
    name: 'stripe-key-leak', title: 'Hardcoded Stripe secret key', file: 'src/config.ts', start: 10,
    lines: [' export const config = {', '   port: Number(process.env.PORT ?? 3000),', '+  stripeKey: "sk_live_REDACTED_DEMO",', '   redisUrl: process.env.REDIS_URL,', ' };'],
    at: [1, 3], kind: 'must_find', severity: 'CRITICAL', category: 'security',
  },
  {
    name: 'ssrf-webhook', title: 'SSRF: user-controlled webhook URL', file: 'src/api/public/webhooks.ts', start: 58,
    lines: [' app.post("/webhooks/forward", async (req, reply) => {', '+  const target = String(req.body.url);', '+  const res = await fetch(target, { method: "POST", body: JSON.stringify(req.body.event) });', '+  return reply.send({ status: res.status });', ' });'],
    at: [1, 3], kind: 'must_find', severity: 'CRITICAL', category: 'security',
  },
  {
    name: 'sql-injection-user-search', title: 'SQL injection in user search', file: 'src/api/users.ts', start: 40,
    lines: [' export async function searchUsers(db: Db, term: string) {', '+  const rows = await db.query(`SELECT * FROM users WHERE name LIKE \'%${term}%\'`);', '+  return rows;', ' }'],
    at: [0, 2], kind: 'must_find', severity: 'CRITICAL', category: 'security',
  },
  {
    name: 'missing-authz-admin-delete', title: 'Admin route without authorization check', file: 'src/api/admin.ts', start: 12,
    lines: [' const router = Router();', '+router.delete("/admin/users/:id", async (req, res) => {', '+  await db.users.delete(req.params.id);', '+  res.sendStatus(204);', '+});', ' export default router;'],
    at: [1, 4], kind: 'must_find', severity: 'CRITICAL', category: 'security',
  },
  {
    name: 'lethal-trifecta-issue-agent', title: 'Lethal trifecta: untrusted input reaches exfil path', file: 'src/agent/tools.ts', start: 20,
    lines: [' export async function triageIssue(issue: Issue) {', '+  const customer = await db.customers.find(issue.customerId);', '+  const prompt = `Issue: ${issue.body}\\nCustomer: ${JSON.stringify(customer)}`;', '+  const plan = await llm.complete(prompt);', '+  await fetch(plan.callbackUrl, { method: "POST", body: JSON.stringify(customer) });', ' }'],
    at: [1, 4], kind: 'must_find', severity: 'CRITICAL', category: 'security',
  },
  {
    name: 'jwt-accepts-none-algorithm', title: 'JWT verification accepts the "none" algorithm', file: 'src/auth/jwt.ts', start: 8,
    lines: [' export function verify(token: string) {', '+  return jwt.verify(token, SECRET, { algorithms: ["none", "HS256"] });', ' }'],
    at: [0, 2], kind: 'must_find', severity: 'CRITICAL', category: 'security',
  },
  {
    name: 'missing-retry-after', title: 'Retry-After header omitted on 429', file: 'src/middleware/ratelimit.ts', start: 48,
    lines: [' if (bucket.tokens < 1) {', '+  return res.status(429).json({ error: "rate_limited" });', ' }', ' bucket.tokens -= 1;'],
    at: [0, 2], kind: 'must_find', severity: 'WARNING', category: 'bug',
  },
  {
    name: 'unused-import-noise', title: 'Unused import', file: 'src/utils/format.ts', start: 1,
    lines: ['+import { readFileSync } from "node:fs";', ' import { pad } from "./pad";', ' export const money = (n: number) => pad(n.toFixed(2));'],
    at: [0, 1], kind: 'must_not_flag', severity: 'SUGGESTION', category: 'style',
  },
  {
    name: 'test-fixture-dummy-key', title: 'Dummy API key in a test fixture', file: 'src/__tests__/fixtures.ts', start: 3,
    lines: [' export const fixtures = {', '+  apiKey: "test-key-not-a-real-secret",', '+  baseUrl: "http://localhost:0",', ' };'],
    at: [1, 2], kind: 'must_not_flag', severity: 'WARNING', category: 'security',
  },
  {
    name: 'clean-refactor-no-flags', title: 'Pure refactor', file: 'src/utils/total.ts', start: 5,
    lines: [' export function total(items: Item[]) {', '+  return items.reduce((sum, item) => sum + item.price * item.qty, 0);', ' }'],
    at: null, kind: 'none',
  },
];

/** Unified diff text for a seed case. */
export function seedDiff(c: SeedCase): string {
  const oldN = c.lines.filter((l) => !l.startsWith('+')).length;
  const newN = c.lines.filter((l) => !l.startsWith('-')).length;
  return [
    `diff --git a/${c.file} b/${c.file}`,
    `--- a/${c.file}`,
    `+++ b/${c.file}`,
    `@@ -${c.start},${oldN} +${c.start},${newN} @@`,
    ...c.lines,
  ].join('\n') + '\n';
}

export function seedExpected(c: SeedCase) {
  const loc = c.at && {
    file: c.file,
    start_line: c.start + c.at[0],
    end_line: c.start + c.at[1],
    severity: c.severity,
    category: c.category,
    title: c.title,
  };
  return {
    must_find: c.kind === 'must_find' && loc ? [loc] : [],
    must_not_flag: c.kind === 'must_not_flag' && loc ? [loc] : [],
  };
}

/** Idempotent: inserts the gold set for the Security Reviewer; links the sample review to that agent. */
export async function seedEvalCases(db: Db, workspaceId: string): Promise<void> {
  const [agent] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'Security Reviewer')));
  if (!agent) return;

  const existing = await db
    .select({ name: t.evalCases.name })
    .from(t.evalCases)
    .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerId, agent.id)));
  const have = new Set(existing.map((e) => e.name));
  const missing = EVAL_SEED_CASES.filter((c) => !have.has(c.name));
  if (missing.length > 0) {
    await db.insert(t.evalCases).values(
      missing.map((c) => ({
        workspaceId,
        ownerKind: 'agent' as const,
        ownerId: agent.id,
        name: c.name,
        inputDiff: seedDiff(c),
        inputMeta: { title: c.title, source: 'seed' },
        expectedOutput: seedExpected(c),
        expectationKind: c.kind,
      })),
    );
  }

  // The sample review on PR #482 was inserted before agents existed: attribute it to the
  // Security Reviewer so "Turn into eval case" works on its findings.
  await db
    .update(t.reviews)
    .set({ agentId: agent.id })
    .where(and(eq(t.reviews.workspaceId, workspaceId), eq(t.reviews.model, 'seed'), isNull(t.reviews.agentId)));
}

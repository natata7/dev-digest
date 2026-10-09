import { describe, it, expect } from 'vitest';
import { EvalService } from './service.js';
import type { EvalRepository, EvalCaseRow } from './repository.js';
import type { Container } from '../../platform/container.js';

// built at runtime so no key-shaped literal sits in the repo (GitHub push protection)
const KEY_TAIL = '51H8xq2Ka9Vn3PqLm7Rd0bZ4Xc';

const WS = 'ws-1';
const PATCH = `@@ -10,6 +10,7 @@
 export const config = {
   port: 1,
+  stripeKey: "sk_live_${KEY_TAIL}",
   redisUrl: x,
 };`;

interface Setup {
  accepted?: Date | null;
  dismissed?: Date | null;
  agentId?: string | null;
  agentExists?: boolean;
  workspace?: string;
  existing?: EvalCaseRow[];
  startLine?: number;
}

function build(o: Setup = {}) {
  const inserted: Array<Record<string, unknown>> = [];
  const finding = {
    id: 'f1', file: 'src/config.ts', startLine: o.startLine ?? 12, endLine: o.startLine ?? 12, severity: 'CRITICAL',
    category: 'security', title: 'Hardcoded Stripe key', acceptedAt: o.accepted ?? null, dismissedAt: o.dismissed ?? null,
  };
  const reviewRepo = {
    findingContext: async () => ({
      finding,
      review: { agentId: o.agentId === undefined ? 'a1' : o.agentId },
      pull: { id: 'p1', workspaceId: o.workspace ?? WS, repoId: 'r1', title: 'Add stripe', base: 'main', headSha: 'h' },
    }),
    getRepo: async () => ({ owner: 'acme', name: 'x' }),
    getPrFiles: async () => [{ path: 'src/config.ts', patch: PATCH }],
  };
  const container = {
    reviewRepo,
    db: {},
    git: { diff: async () => { throw new Error('no clone'); } },
  } as unknown as Container;
  const repo = {
    getAgent: async () => (o.agentExists === false ? undefined : { id: 'a1', workspaceId: WS }),
    listCases: async () => o.existing ?? [],
    countCases: async () => (o.existing ?? []).length,
    insertCase: async (v: Record<string, unknown>) => {
      inserted.push(v);
      return {
        id: 'c-new', ownerId: 'a1', name: v.name, inputDiff: v.inputDiff, inputMeta: v.inputMeta, expectedOutput: v.expected,
        expectationKind: v.kind, sourceFindingId: v.sourceFindingId ?? null, notes: null,
      } as unknown as EvalCaseRow;
    },
  } as unknown as EvalRepository;
  return { service: new EvalService(container, repo), inserted };
}

describe('EvalService.createFromFinding', () => {
  it('accepted finding → must_find case with file:line and a diff fragment (AC-1, AC-7)', async () => {
    const { service, inserted } = build({ accepted: new Date() });
    const r = await service.createFromFinding(WS, 'f1');
    expect(r.created).toBe(true);
    expect(r.case.expectation_kind).toBe('must_find');
    expect(r.case.expected_output.must_find[0]).toMatchObject({ file: 'src/config.ts', start_line: 12, end_line: 12 });
    expect(r.case.expected_output.must_not_flag).toEqual([]);
    expect(r.case.name).toBe('hardcoded-stripe-key');
    expect(inserted[0]!.sourceFindingId).toBe('f1');
  });

  it('dismissed finding → must_not_flag case (AC-2)', async () => {
    const { service } = build({ dismissed: new Date() });
    const r = await service.createFromFinding(WS, 'f1');
    expect(r.case.expectation_kind).toBe('must_not_flag');
    expect(r.case.expected_output.must_not_flag).toHaveLength(1);
    expect(r.case.expected_output.must_find).toEqual([]);
  });

  it('undecided finding defaults to must_find and honours an explicit choice (AC-3)', async () => {
    expect((await build().service.createFromFinding(WS, 'f1')).case.expectation_kind).toBe('must_find');
    expect((await build().service.createFromFinding(WS, 'f1', 'must_not_flag')).case.expectation_kind).toBe('must_not_flag');
  });

  it('masks the secret in the stored fragment', async () => {
    const { service, inserted } = build({ accepted: new Date() });
    await service.createFromFinding(WS, 'f1');
    const stored = String(inserted[0]!.inputDiff);
    expect(stored).not.toContain(KEY_TAIL);
    expect(stored).toContain('sk_live_********');
  });

  it('returns the existing case instead of inserting a duplicate (AC-5)', async () => {
    const existing = {
      id: 'c-old', ownerId: 'a1', name: 'old', inputDiff: 'd', expectationKind: 'must_find', sourceFindingId: 'f1',
      expectedOutput: { must_find: [], must_not_flag: [] }, inputMeta: null, notes: null,
    } as unknown as EvalCaseRow;
    const { service, inserted } = build({ accepted: new Date(), existing: [existing] });
    const r = await service.createFromFinding(WS, 'f1');
    expect(r.created).toBe(false);
    expect(r.case.id).toBe('c-old');
    expect(inserted).toHaveLength(0);
  });

  it('rejects when the producing agent was deleted or unknown (AC-6)', async () => {
    await expect(build({ agentExists: false }).service.createFromFinding(WS, 'f1')).rejects.toMatchObject({ code: 'agent_not_found' });
    await expect(build({ agentId: null }).service.createFromFinding(WS, 'f1')).rejects.toMatchObject({ code: 'agent_not_found' });
  });

  it("404s for another workspace's finding", async () => {
    await expect(build({ workspace: 'other' }).service.createFromFinding(WS, 'f1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a finding outside the diff (E12)', async () => {
    await expect(build({ startLine: 900 }).service.createFromFinding(WS, 'f1')).rejects.toMatchObject({ statusCode: 422 });
  });
});

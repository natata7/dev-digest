import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateEvalCaseFromFinding,
  EvalCaseFromFindingResult,
  EvalCaseInput,
  EvalCaseRecord,
  EvalAgentRun,
  EvalAgentDashboard,
  EvalCompare,
  EvalOverview,
  RunEvalsInput,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EvalService } from './service.js';

const CaseBody = EvalCaseInput.omit({ owner_kind: true, owner_id: true });

/**
 * Eval pipeline.
 *   POST   /findings/:id/eval-case      → one-click case from a finding
 *   GET    /agents/:id/eval-cases       → the agent's case set (+ last result per case)
 *   POST   /agents/:id/eval-cases       → manual case
 *   PUT    /eval-cases/:id              → edit a case
 *   DELETE /eval-cases/:id              → delete a case
 *   POST   /agents/:id/eval-runs        → run the agent over its case set (scored by code, no LLM judge)
 *   GET    /agents/:id/eval-runs        → run history (newest first)
 *   GET    /eval-runs/compare?a=&b=     → metric deltas + both prompt snapshots
 *   GET    /agents/:id/eval-dashboard   → metrics, delta, trend, runs, regression alert
 *   GET    /eval/dashboard              → all agents + recent runs
 */
export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new EvalService(container);

  app.post(
    '/findings/:id/eval-case',
    {
      schema: {
        params: IdParams,
        body: CreateEvalCaseFromFinding.nullish(),
        response: { 200: EvalCaseFromFindingResult },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.createFromFinding(workspaceId, req.params.id, req.body?.expectation);
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseRecord) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: CaseBody, response: { 200: EvalCaseRecord } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.createCase(workspaceId, req.params.id, req.body);
    },
  );

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: CaseBody, response: { 200: EvalCaseRecord } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete('/eval-cases/:id', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    await service.deleteCase(workspaceId, req.params.id);
    return { ok: true };
  });

  app.post(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, body: RunEvalsInput.nullish(), response: { 200: EvalAgentRun } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.runAgent(workspaceId, req.params.id, req.body?.case_ids);
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: z.array(EvalAgentRun) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listRuns(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval-runs/compare',
    {
      schema: {
        querystring: z.object({ a: z.string().uuid(), b: z.string().uuid() }),
        response: { 200: EvalCompare },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.compare(workspaceId, req.query.a, req.query.b);
    },
  );

  app.get(
    '/agents/:id/eval-dashboard',
    { schema: { params: IdParams, response: { 200: EvalAgentDashboard } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.agentDashboard(workspaceId, req.params.id);
    },
  );

  app.get('/eval/dashboard', { schema: { response: { 200: EvalOverview } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.overview(workspaceId);
  });
}

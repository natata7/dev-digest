import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CreateEvalCaseFromFinding,
  EvalCaseFromFindingResult,
  EvalCaseInput,
  EvalCaseRecord,
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
}

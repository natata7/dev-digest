import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadius, PrHistory } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

/**
 * Blast radius module.
 *   GET /pulls/:id/blast → grouped impact map (changed symbols → callers →
 *                           endpoints/crons), read straight from the
 *                           repo-intel index. No LLM call, no AST/graph
 *                           rebuild on this path — see `BlastService.get`.
 *   GET /pulls/:id/history → merged PRs/MRs that previously touched the same
 *                             files ("Prior PRs") — see `BlastService.history`.
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService(container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadius } } },
    async (req): Promise<BlastRadius> => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id, req.log);
    },
  );

  app.get(
    '/pulls/:id/history',
    { schema: { params: IdParams, response: { 200: PrHistory } } },
    async (req): Promise<PrHistory> => {
      const { workspaceId } = await getContext(container, req);
      return service.history(workspaceId, req.params.id, req.log);
    },
  );
}

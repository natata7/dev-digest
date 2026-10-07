import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { Onboarding } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

/**
 * Onboarding tour.
 *   GET  /repos/:id/onboarding → stored tour (never calls the LLM) or 404 no_tour
 *   POST /repos/:id/onboarding → (re)generate: facts → skeleton → ≤ 1 LLM call
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new OnboardingService(container);

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: Onboarding } } },
    async (req): Promise<Onboarding> => {
      const { workspaceId } = await getContext(container, req);
      return service.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, body: z.object({}).nullish(), response: { 200: Onboarding } } },
    async (req): Promise<Onboarding> => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.id, req.log);
    },
  );
}

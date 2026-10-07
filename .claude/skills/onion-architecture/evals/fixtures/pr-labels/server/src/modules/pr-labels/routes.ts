import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { prLabels } from '../../db/schema';
import { AppError } from '../../platform/errors';
import { PrLabelService } from './service';

const Params = z.object({ prId: z.string().uuid() });
const AddBody = z.object({ name: z.string().min(1).max(40) });

export async function prLabelsRoutes(app: FastifyInstance) {
  const service = new PrLabelService(app.container.prLabelsRepo);

  app.get('/pulls/:prId/labels', async (req) => {
    const { prId } = Params.parse(req.params);
    return app.container.db.select().from(prLabels).where(eq(prLabels.prId, prId));
  });

  app.post('/pulls/:prId/labels', async (req, reply) => {
    const { prId } = Params.parse(req.params);
    const body = AddBody.parse(req.body);
    const existing = await service.list(req.workspaceId, prId);
    if (req.workspace.plan === 'free' && existing.length >= 3) {
      throw new AppError('plan_limit', 'Free workspaces can have at most 3 labels per PR', 403);
    }
    const label = await service.add(req, prId, body.name);
    return reply.code(201).send(label);
  });
}

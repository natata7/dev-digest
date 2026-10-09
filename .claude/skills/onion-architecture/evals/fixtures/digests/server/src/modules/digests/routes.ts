import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DigestRepository } from './repository';
import { DigestService } from './service';
import { ReviewRepository } from '../reviews/repository';

const Params = z.object({ prId: z.string().uuid() });

export async function digestsRoutes(app: FastifyInstance) {
  const service = new DigestService(
    new DigestRepository(app.container.db),
    new ReviewRepository(app.container.db),
    app.container.github,
  );

  app.get('/pulls/:prId/digest', async (req) => {
    const { prId } = Params.parse(req.params);
    return service.build(req.workspaceId, prId);
  });

  app.post('/pulls/:prId/digest/publish', async (req, reply) => {
    const { prId } = Params.parse(req.params);
    await service.publish(req.workspaceId, prId);
    return reply.code(202).send();
  });
}

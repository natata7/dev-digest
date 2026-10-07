import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ContextFile, ContextList } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/** Project Context (read-only): list + read docs from the repo clone. */
export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = container.contextService;

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ContextList } } },
    async (req): Promise<ContextList> => {
      const { workspaceId } = await getContext(container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    {
      schema: {
        params: IdParams,
        querystring: z.object({ path: z.string().min(1).max(1024) }),
        response: { 200: ContextFile },
      },
    },
    async (req): Promise<ContextFile> => {
      const { workspaceId } = await getContext(container, req);
      return service.read(workspaceId, req.params.id, req.query.path);
    },
  );
}

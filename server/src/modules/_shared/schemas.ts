import { z } from 'zod';

/**
 * Shared route param schemas. Most `/:id` routes address a DB row whose primary
 * key is a uuid (see db/schema/*), so validate that shape at the edge — an
 * invalid id becomes a clean 422 instead of a downstream DB/500.
 *
 * NOTE: not every `:id` is a uuid (e.g. `/providers/:id` where id is a provider
 * name like "openai"); those routes use their own schema.
 */
export const IdParams = z.object({ id: z.string().uuid() });
export type IdParams = z.infer<typeof IdParams>;

export const MAX_CONTEXT_PATHS = 100;

/** Body for PUT /agents|skills/:id/context. Existence on disk is NOT checked (a vanished file is allowed). */
export const ContextPathsBody = z.object({
  paths: z
    .array(
      z
        .string()
        .min(1)
        .refine((p) => !p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..'), {
          message: 'Path must be relative and must not contain ..',
        }),
    )
    .max(MAX_CONTEXT_PATHS)
    .refine((a) => new Set(a).size === a.length, { message: 'Duplicate paths' }),
});

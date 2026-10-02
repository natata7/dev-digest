import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** Onboarding data-access: one stored tour per repo (`onboarding` table). */
export class OnboardingRepository {
  constructor(private db: Db) {}

  async get(repoId: string): Promise<{ json: unknown; generatedAt: Date } | null> {
    const [row] = await this.db
      .select({ json: t.onboarding.json, generatedAt: t.onboarding.generatedAt })
      .from(t.onboarding)
      .where(eq(t.onboarding.repoId, repoId))
      .limit(1);
    return row ?? null;
  }

  async upsert(repoId: string, json: unknown, generatedAt: Date): Promise<void> {
    await this.db
      .insert(t.onboarding)
      .values({ repoId, json, generatedAt })
      .onConflictDoUpdate({ target: t.onboarding.repoId, set: { json, generatedAt } });
  }
}

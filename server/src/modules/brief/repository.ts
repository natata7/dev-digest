import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** Brief data-access: one stored brief per PR (`pr_brief` table, JSON incl. head_sha). */
export class BriefRepository {
  constructor(private db: Db) {}

  async get(prId: string): Promise<unknown | null> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, prId))
      .limit(1);
    return row ? row.json : null;
  }

  async upsert(prId: string, json: unknown): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, json })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json } });
  }
}

import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { prLabels } from '../../db/schema';

export class PrLabelRepository {
  constructor(private readonly db: Db) {}

  forPull(workspaceId: string, prId: string) {
    return this.db
      .select()
      .from(prLabels)
      .where(and(eq(prLabels.workspaceId, workspaceId), eq(prLabels.prId, prId)));
  }

  async insert(workspaceId: string, label: { prId: string; name: string; createdBy: string }) {
    const [row] = await this.db
      .insert(prLabels)
      .values({ workspaceId, prId: label.prId, name: label.name, createdBy: label.createdBy })
      .returning();
    return row;
  }
}

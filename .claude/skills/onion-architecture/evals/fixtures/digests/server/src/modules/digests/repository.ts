import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { findings, digestRuns } from '../../db/schema';

export class DigestRepository {
  constructor(private readonly db: Db) {}

  worthReporting(workspaceId: string, reviewId: string) {
    return this.db
      .select({
        id: findings.id,
        title: findings.title,
        severity: findings.severity,
        priority: sql<number>`${findings.confidence} * case ${findings.severity} when 'critical' then 4 when 'high' then 3 when 'medium' then 2 else 1 end`,
      })
      .from(findings)
      .where(
        and(
          eq(findings.workspaceId, workspaceId),
          eq(findings.reviewId, reviewId),
          gte(findings.confidence, 0.7),
        ),
      )
      .orderBy(desc(sql`priority`))
      .limit(10);
  }

  async markPublished(workspaceId: string, reviewId: string) {
    await this.db.insert(digestRuns).values({ workspaceId, reviewId, publishedAt: new Date() });
  }
}

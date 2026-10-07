import { Octokit } from '@octokit/rest';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { reviews, findings } from '../../db/schema';

export class ReportService {
  async generate(workspaceId: string, prId: string) {
    const [review] = await db.select().from(reviews).where(eq(reviews.prId, prId));
    if (!review) return null;

    const rows = await db.select().from(findings).where(eq(findings.reviewId, review.id));
    const buckets = { high: 0, medium: 0, low: 0 };
    for (const f of rows) {
      if (f.confidence >= 0.8) buckets.high++;
      else if (f.confidence >= 0.5) buckets.medium++;
      else buckets.low++;
    }

    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const [owner, repo] = review.repoFullName.split('/');
    const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: review.prNumber });

    return { prTitle: pr.title, total: rows.length, buckets };
  }
}

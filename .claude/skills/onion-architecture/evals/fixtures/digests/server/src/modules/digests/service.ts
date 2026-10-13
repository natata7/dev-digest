import type { CodeHostClient } from '@devdigest/shared';
import { ReviewRepository } from '../reviews/repository';
import type { DigestRepository } from './repository';
import { renderDigest } from './format';

export class DigestService {
  constructor(
    private readonly digests: DigestRepository,
    private readonly reviews: ReviewRepository,
    private readonly github: CodeHostClient,
  ) {}

  async build(workspaceId: string, prId: string) {
    const review = await this.reviews.latestForPull(workspaceId, prId);
    if (!review) return null;
    const items = await this.digests.worthReporting(workspaceId, review.id);
    return { reviewId: review.id, items, text: renderDigest(items) };
  }

  async publish(workspaceId: string, prId: string) {
    const digest = await this.build(workspaceId, prId);
    if (!digest) return;
    const pull = await this.github.getPull({ workspaceId, prId });
    await this.github.postComment(pull.number, digest.text);
    await this.digests.markPublished(workspaceId, digest.reviewId);
  }
}

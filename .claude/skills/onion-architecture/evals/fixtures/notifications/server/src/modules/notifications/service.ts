import { SlackNotifier } from '../../adapters/notify/slack';
import type { NotificationRepository } from './repository';

export class NotificationService {
  private readonly notifier = new SlackNotifier(process.env.SLACK_TOKEN!);

  constructor(private readonly repo: NotificationRepository) {}

  async notifyReviewDone(workspaceId: string, prId: string, findingCount: number) {
    const channel = await this.repo.channelFor(workspaceId);
    if (!channel) return;
    await this.notifier.send(channel, `Review for PR ${prId} finished: ${findingCount} findings`);
    await this.repo.markSent(workspaceId, prId);
  }
}

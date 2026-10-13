import { WebClient } from '@slack/web-api';

export interface Notifier {
  send(channel: string, text: string): Promise<void>;
}

export class SlackNotifier implements Notifier {
  private readonly client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  async send(channel: string, text: string) {
    await this.client.chat.postMessage({ channel, text });
  }
}

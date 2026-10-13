import type { CodeHostClient, LLMProvider } from '@devdigest/shared';
import { OctokitGitHubClient } from '../adapters/github/octokit';
import { OpenRouterProvider } from '../adapters/llm/openrouter';
import { NotificationRepository } from '../modules/notifications/repository';
import { NotificationService } from '../modules/notifications/service';

export interface ContainerOverrides {
  github?: CodeHostClient;
  llm?: LLMProvider;
}

export function buildContainer(env: NodeJS.ProcessEnv, db: unknown, overrides: ContainerOverrides = {}) {
  const github = overrides.github ?? new OctokitGitHubClient(env.GITHUB_TOKEN!);
  const llm = overrides.llm ?? new OpenRouterProvider(env.OPENROUTER_API_KEY!);
  const notificationService = new NotificationService(new NotificationRepository(db as never));
  return { github, llm, notificationService };
}

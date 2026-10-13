import type { CodeHostClient, LLMProvider } from '@devdigest/shared';
import { OctokitGitHubClient } from '../adapters/github/octokit';
import { OpenRouterProvider } from '../adapters/llm/openrouter';
import type { Db } from '../db/client';

export interface ContainerOverrides {
  github?: CodeHostClient;
  llm?: LLMProvider;
}

export function buildContainer(env: NodeJS.ProcessEnv, db: Db, overrides: ContainerOverrides = {}) {
  const github = overrides.github ?? new OctokitGitHubClient(env.GITHUB_TOKEN!);
  const llm = overrides.llm ?? new OpenRouterProvider(env.OPENROUTER_API_KEY!);
  return { db, github, llm };
}

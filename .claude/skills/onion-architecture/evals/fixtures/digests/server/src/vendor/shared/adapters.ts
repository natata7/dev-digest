import type { RestEndpointMethodTypes } from '@octokit/rest';
import type { PrRef, ChatRequest, ChatResult } from './contracts';

export interface CodeHostClient {
  getPull(ref: PrRef): Promise<RestEndpointMethodTypes['pulls']['get']['response']['data']>;
  postComment(prNumber: number, body: string): Promise<void>;
}

export interface LLMProvider {
  chat(req: ChatRequest): Promise<ChatResult>;
}

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

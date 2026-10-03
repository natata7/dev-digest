import type { OnboardingLlmReason } from '@devdigest/shared';
import { ConfigError } from '../../platform/errors.js';
import { TimeoutError } from '../../platform/resilience.js';

/** Shared LLM failure reasons (A7: aliases the existing contract enum, no new one). */
export type LlmErrorReason = OnboardingLlmReason;

export function classifyLlmError(err: unknown): LlmErrorReason {
  if (err instanceof ConfigError) return 'llm_not_configured';
  if (err instanceof TimeoutError) return 'llm_timeout';
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err);
  if (/timeout|timed out/i.test(name) || /timeout|timed out/i.test(msg)) return 'llm_timeout';
  if (name === 'ZodError' || /schema validation|ZodError/i.test(msg)) return 'llm_invalid_output';
  return 'llm_failed';
}

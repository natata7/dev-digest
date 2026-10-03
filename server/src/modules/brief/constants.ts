/** PR Brief tunables. Token figures are approxTokens estimates (chars / 4). */
export const INPUT_TOKEN_BUDGET = 8000;
export const CAP = { system: 800, intent: 400, blast: 1200, diff: 3600, description: 800, specs: 1200 } as const;
export const SPEC_DOC_HEAD_TOKENS = 400;
export const BLAST_CALLERS_MAX = 40;
export const BLAST_CALLERS_KEEP = 10;
export const DIFF_ROWS_KEEP = 20;
export const DIFF_ROW_RANGES_MAX = 8;
export const MAX_RISKS = 8;
export const MAX_FOCUS = 8;
export const LLM_MAX_TOKENS = 2000;
export const LLM_TIMEOUT_MS = 60_000;
export const LLM_MAX_RETRIES = 2;

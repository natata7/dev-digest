import { z } from 'zod';
import { OnboardingLink } from '@devdigest/shared';

export const READING_PATH_N = 12;
export const ROUTES_MAX = 50;
export const SCRIPTS_MAX = 30;
export const SCRIPT_CMD_MAX = 200;
export const STRUCTURE_MAX = 40;
export const NESTED_MANIFESTS_MAX = 10;
export const DEPS_PER_MANIFEST_MAX = 50;
export const README_MAX = 4000;
export const FACTS_TOKEN_BUDGET = 12000;
export const LLM_MAX_TOKENS = 4000;
export const LLM_TIMEOUT_MS = 90_000;
export const CHAINS_MAX = 5;
export const WHY_MAX = 200;
export const TITLE_MAX = 120;
export const BODY_MAX = 8000;
export const RUN_STEPS_MAX = 8;
export const FIRST_TASKS_MAX = 5;
export const NOTE_MAX = 200;
export const TASK_TITLE_MAX = 120;
/** Skeleton text for sections with no index data; the client mirrors it (D26). */
export const UNAVAILABLE_PREFIX = 'Unavailable — index';
/** Hard cap on directory entries visited by the clone walk. */
export const WALK_VISIT_CAP = 50_000;
/** Directory depth (root = 0) for manifests / structure. */
export const WALK_MAX_DEPTH = 2;

/** Non-JS (and JS-adjacent) manifests reported by presence only (AC-8). */
export const PRESENCE_MANIFESTS = [
  'go.mod',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'Gemfile',
  'composer.json',
  'Dockerfile',
  'docker-compose.yml',
  'Makefile',
] as const;

/** The only env files ever read (AC-35). */
export const ENV_TEMPLATES = ['.env.example', '.env.sample', '.env.template'] as const;
export const README_RE = /^readme(\.md|\.markdown|\.txt)?$/i;
export const ENV_NAME_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

/** Server-only, lenient per section so AC-20 per-section validation is possible. */
export const OnboardingLlmOutput = z.object({
  sections: z.array(
    z.object({
      kind: z.string(),
      title: z.string(),
      body: z.string(),
      diagram: z.string().nullable(),
      links: z.array(OnboardingLink),
    }),
  ),
  reading_why: z.array(z.object({ path: z.string(), why: z.string() })),
  // Required-nullable: strict json_schema rejects .optional() (D20).
  run_steps: z.array(z.object({ command: z.string(), note: z.string().nullable() })).nullable(),
  first_tasks: z.array(z.object({ title: z.string(), path: z.string() })).nullable(),
});
export type OnboardingLlmOutput = z.infer<typeof OnboardingLlmOutput>;

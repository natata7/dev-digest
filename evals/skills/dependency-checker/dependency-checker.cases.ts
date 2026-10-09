import type { SkillCase } from "../../src/index.js";

// This skill's job is to analyze real files (package.json, tsconfig.json, node_modules sizes),
// but "quality" cases run with no tools (skillTask measures the SKILL.md content in isolation —
// see tasks.ts). So each prompt inlines a small synthetic dataset the skill can reason over
// directly, standing in for what the skill would normally gather itself with Read/Bash/Grep.

const REPO_DATA = `Here is the data you'd normally gather yourself — treat it as already collected, and produce the report directly from it (do not ask for tool access or more data).

server/package.json dependencies: fastify@5.1.0, drizzle-orm@0.36.0, zod@3.23.8, pg@8.13.0, moment@2.30.1
server/package.json devDependencies: vitest@2.1.4, typescript@5.6.3, tsx@4.19.0
client/package.json dependencies: next@15.0.3, react@19.0.0, react-dom@19.0.0, @tanstack/react-query@5.59.0, zod@3.22.4, date-fns@4.1.0
client/package.json devDependencies: vitest@2.1.4, typescript@5.6.3, tailwindcss@3.4.14
reviewer-core/package.json dependencies: zod@3.23.8
reviewer-core/package.json devDependencies: typescript@5.6.3
e2e/package.json dependencies: (none runtime)
e2e/package.json devDependencies: playwright@1.48.2, typescript@5.6.3

Installed sizes (du -sh):
server/node_modules/moment: 4.2M
server/node_modules/drizzle-orm: 8.1M
server/node_modules/fastify: 6.5M
server/node_modules/pg: 3.8M
server/node_modules/zod: 2.1M
client/node_modules/next: 132M
client/node_modules/react-dom: 6.9M
client/node_modules/date-fns: 22M
client/node_modules/zod: 1.9M
reviewer-core/node_modules/zod: 2.1M
e2e/node_modules/playwright: 210M

server/package.json also declares zod@3.23.8, client/package.json declares zod@3.22.4, reviewer-core/package.json declares zod@3.23.8 — two different zod versions across packages: 3.23.8 (server, reviewer-core) vs 3.22.4 (client).

grep for imports crossing package boundaries:
- server/src/routes/reviews.ts imports types from "@shared/review-types" (alias to server/src/vendor/shared)
- server/src/services/review-service.ts imports "reviewer-core/src/pipeline.js" directly by relative path (not via the package's public entry point)
- client/src/lib/api-types.ts imports "@shared/review-types" (same alias as server)
- grep found no import of "moment" anywhere under server/src — only present in package.json`;

const HIDDEN_ISSUES_DATA = `Data already collected — produce the answer directly from it, do not ask for tools.

server/package.json dependencies: fastify@5.1.0, pg@8.13.0, typescript@5.6.3, vitest@2.1.4, @types/node@22.9.0
server/package.json devDependencies: tsx@4.19.0
client/package.json dependencies: next@15.0.3, react@19.0.0, moment@2.30.1, date-fns@4.1.0
Installed sizes: server/node_modules/typescript 23M, vitest 2.8M, fastify 6.5M, pg 3.8M; client/node_modules/moment 4.2M, date-fns 22M, next 132M

grep results:
- server/src: imports "fastify" in app.ts, "pg" in db.ts; no imports of "typescript" or "vitest" outside *.test.ts files and vitest.config.ts
- server/package.json scripts: "dev": "tsx watch src/index.ts", "test": "vitest run", "build": "tsc"
- client/src/lib/format-date.ts imports "moment"
- client/src/components/Timeline.tsx imports "date-fns"
`;

export const cases: SkillCase[] = [
  {
    name: "full report follows the required 5-section structure with a Mermaid graph",
    kind: "quality",
    prompt: `Run a dependency check on this repo. I want the full report: graph, sizes, prioritized findings, recommendations.\n\n${REPO_DATA}`,
    grounding: ["```mermaid", "flowchart"],
    practices: [
      "the report has a section named 'Scope' listing which packages (client, server, reviewer-core, e2e) were analyzed",
      "the report includes a Mermaid diagram (a fenced ```mermaid code block using flowchart) showing dependency relationships between packages",
      "the report has a section with a size breakdown table showing dependencies and their installed size, not just a vague size statement",
      "the report has a 'Findings & Priorities' section (or equivalently named) that groups findings under explicit severity tiers such as P0, P1, P2, or Info — not an unranked bullet list",
      "the report ends with a Summary section giving 3-5 concrete, actionable takeaways ordered by priority",
      "every finding names a specific package, dependency, or file rather than giving generic advice like 'consider optimizing dependencies'",
    ],
    threshold: 0.7,
    maxTurns: 10,
  },
  {
    name: "distinguishes internal (path-alias) dependencies from external npm dependencies",
    kind: "quality",
    prompt: `This repo isn't a monorepo — server, client, reviewer-core, and e2e share code via TypeScript path aliases, not workspace:* packages. Analyze our dependencies, including how these packages depend on each other internally.\n\n${REPO_DATA}`,
    practices: [
      "the answer explicitly distinguishes internal cross-package dependencies (the @shared/review-types alias and the direct relative import into reviewer-core/src/pipeline.js) from external npm package dependencies, rather than treating them as the same kind of dependency",
      "the answer flags server/src/services/review-service.ts importing reviewer-core/src/pipeline.js by relative path instead of through reviewer-core's public entry point as a P0-tier or otherwise explicitly called-out issue",
      "the answer does not claim these packages are linked via workspace:* or pnpm workspaces, since the project explicitly is not a monorepo",
    ],
    threshold: 0.6,
    maxTurns: 10,
  },
  {
    name: "severity tiers are used consistently and recommendations are specific, not vague",
    kind: "quality",
    prompt: `We suspect some npm dependencies in server/ and client/ are unused or duplicated across packages with different versions. Check our dependencies and tell me what to prioritize fixing first.\n\n${REPO_DATA}`,
    practices: [
      "findings are explicitly labeled with one of the defined severity tiers (P0, P1, P2, or Info) rather than left unranked",
      "client declaring zod 3.22.4 while server and reviewer-core declare 3.23.8 is called out explicitly as version drift",
      "moment being declared in server/package.json but never imported anywhere under server/src is called out explicitly as an unused dependency",
      "each recommendation names a specific package name and package.json/file location (e.g. server/package.json, moment, zod) rather than a generic suggestion",
      "removing a dependency (e.g. moment) is presented as a recommendation for the user to confirm, not something already executed",
    ],
    threshold: 0.6,
    maxTurns: 10,
  },
  // --- Analysis-quality cases: no format hints in the prompt, so these measure the quality of
  // the analysis itself (the raw model can't win just by knowing the house report format).
  {
    name: "finds misplaced dependencies without being told where to look",
    kind: "quality",
    prompt: `Review the dependencies of our server package and tell me what is wrong with how they are declared.\n\n${HIDDEN_ISSUES_DATA}`,
    practices: [
      "typescript and vitest being declared under server dependencies (runtime) instead of devDependencies is called out as misplaced",
      "@types/node being declared under dependencies instead of devDependencies is called out as misplaced",
      "the answer does not flag fastify or pg as misplaced, since both are imported at runtime in server/src",
    ],
    threshold: 0.66,
    maxTurns: 10,
  },
  {
    name: "detects two libraries doing the same job in one package",
    kind: "quality",
    prompt: `Which dependencies in the client package overlap or can be consolidated? Be specific.\n\n${HIDDEN_ISSUES_DATA}`,
    practices: [
      "moment and date-fns are identified as two libraries serving the same date-handling role in client",
      "the answer recommends consolidating on a single date library (either one is acceptable) and gives a reason, such as lower installed size, tree-shaking, or moment being in maintenance mode",
      "the answer names the files that import each library (client/src/lib/format-date.ts for moment, client/src/components/Timeline.tsx for date-fns) so the migration scope is concrete",
    ],
    threshold: 0.66,
    maxTurns: 10,
  },
];

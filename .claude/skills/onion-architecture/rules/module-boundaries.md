# Module boundaries and port purity

Vertical slices (`modules/<feature>/`) are only useful if each slice's inside stays private. Three rules keep the inward dependency rule intact *between* modules and *across* ports, not just within one module.

## 1. Modules talk through services, never through each other's repositories or tables

```ts
// ❌ modules/digests/service.ts
import { ReviewRepository } from '../reviews/repository';
```

**Breaks:** the `reviews` module can no longer change its schema or scoping rules without silently breaking `digests`; the workspace-scoping and DTO mapping `ReviewService` does are bypassed; and the test for `digests` now needs `reviews`' real persistence.
**Fix:** depend on what the other module *exposes* — its `service.ts` (or a narrow port the consumer defines and the container satisfies with that service). Never import another module's `repository.ts`, its Drizzle row types, or query its tables from your own repository. If the data you need isn't exposed, add a method to the owning module's service.

## 2. Port signatures use only shared/domain types

```ts
// ❌ server/src/vendor/shared/adapters.ts
getPull(ref: PrRef): Promise<RestEndpointMethodTypes['pulls']['get']['response']['data']>;
```

**Breaks:** the port exists so the vendor can be swapped, but its signature names the vendor's types — every consumer is now coupled to Octokit, and a GitLab adapter cannot implement it without faking Octokit shapes.
**Fix:** return a plain shared type (`PrMeta`, a Zod-inferred contract); the adapter maps the SDK response to it. Check every port method's parameters and return type for `Octokit`, `openai`, `drizzle`, `Fastify` names.

## 3. Repositories persist and fetch; they do not decide

```ts
// ❌ repository.ts
.where(gte(findings.confidence, 0.7))               // "what counts as digest-worthy"
.orderBy(desc(sql`severity_rank * confidence`))      // "how important is it"
```

**Breaks:** a business policy (thresholds, ranking) is now hidden in SQL where it can't be unit-tested without Postgres and can't be reused by another caller.
**Fix:** the repository returns the candidate rows by a plain criterion (workspace, time window); the policy lives in a pure function (domain) that `service.ts` calls. Query-level filtering for performance is fine when the *constant* comes from the domain, not when the repository invents the rule.

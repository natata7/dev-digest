"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { formatRunCost, formatTokens } from "@/components/run-cost-badge";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { useRepos, useResyncRepoIntel } from "@/lib/hooks";
import { useGenerateOnboardingTour, useOnboardingTour } from "@/lib/hooks/onboarding";
import { IN_PROGRESS_REFETCH_MS, SECTION_KINDS } from "./constants";
import { formatWhen, isIndexReason, truncatedCategories } from "./helpers";
import { s } from "./styles";

export function OnboardingTourView() {
  const t = useTranslations("onboarding");
  const repoId = useParams<{ repoId: string }>().repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const repos = useRepos();
  const repo = repos.data?.find((r) => r.id === repoId);
  const { data: tour, isLoading, isError, refetch } = useOnboardingTour(repoId);
  const generate = useGenerateOnboardingTour(repoId);
  const resync = useResyncRepoIntel(repoId);
  const [inProgress, setInProgress] = React.useState(false);

  const notCloned =
    repo?.clone_path === null ||
    (generate.error instanceof ApiError && generate.error.code === "repo_not_cloned");

  const run = () => {
    setInProgress(false);
    generate.mutate(undefined, {
      onError: (e) => {
        if (e instanceof ApiError && e.code === "generation_in_progress") {
          setInProgress(true);
          setTimeout(() => refetch(), IN_PROGRESS_REFETCH_MS); // D13: one refetch
        }
      },
    });
  };

  const crumb = [{ label: t("title") }];
  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const busy = generate.isPending || inProgress;
  const disabled = busy || notCloned;
  const postFailed = generate.isError && !inProgress && !notCloned;

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.h1}>
              {t("title")} {activeRepo?.full_name ? `· ${activeRepo.full_name}` : ""}
            </h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
          </div>
          <div style={s.actions}>
            {tour?.outdated && <Badge>{t("outdated")}</Badge>}
            {tour && (
              <Button kind="ghost" size="sm" icon="RefreshCw" disabled={disabled} onClick={run}>
                {t("regenerate")}
              </Button>
            )}
          </div>
        </div>

        {notCloned && (
          <div style={s.banner} role="status">
            {t("notCloned")}
          </div>
        )}
        {busy && (
          <div style={s.banner} role="status">
            {inProgress && !generate.isPending ? t("alreadyGenerating") : t("generating")}
          </div>
        )}
        {(isError || postFailed) && (
          <ErrorState
            title={t("loadError")}
            onRetry={() => (isError ? refetch() : run())}
          />
        )}
        {isLoading && <Skeleton height={160} />}

        {tour === null && !isLoading && !isError && (
          <EmptyState
            icon="ListChecks"
            title={t("empty.title")}
            body={
              <>
                {t("empty.body")}
                <ol style={s.list}>
                  {SECTION_KINDS.map((k) => (
                    <li key={k}>{t(`sectionNames.${k}`)}</li>
                  ))}
                </ol>
                {/* vendored EmptyState CTA has no disabled prop (AC-4) */}
                <Button disabled={disabled} loading={busy} onClick={run}>
                  {t("generate")}
                </Button>
              </>
            }
          />
        )}

        {tour && (
          <>
            {tour.regeneration_error && (
              <div style={s.banner} role="status">
                {t("regenerationFailed", {
                  reason: t(`reasons.${tour.regeneration_error}`),
                  when: formatWhen(tour.generated_at),
                })}
              </div>
            )}
            {tour.status !== "complete" && tour.reason && (
              <div style={s.banner} role="status">
                <span>
                  {t(`status.${tour.status}`)} {t(`reasons.${tour.reason}`)}.
                </span>
                {isIndexReason(tour.reason) && (
                  <Button
                    kind="ghost"
                    size="sm"
                    icon="RefreshCw"
                    loading={resync.isPending}
                    onClick={() => resync.mutate()}
                  >
                    {t("resync")}
                  </Button>
                )}
              </div>
            )}
            {tour.status === "partial" && (
              <p style={s.note}>
                {t("partialNote", {
                  indexed: tour.coverage.files_indexed,
                  skipped: tour.coverage.files_skipped,
                })}
              </p>
            )}
            {truncatedCategories(tour.coverage).map((c) => (
              <p key={c.key} style={s.note}>
                {t("showing", { label: t(`coverage.${c.key}`), shown: c.shown, total: c.total })}
              </p>
            ))}

            {tour.sections.map((sec) => (
              <section key={sec.kind} style={s.section}>
                <h2 style={s.h2}>{sec.title}</h2>
                {/* AC-36: Markdown only (no raw HTML); AC-31: invalid diagram renders nothing */}
                <Markdown>{sec.body}</Markdown>
                {sec.diagram && <MermaidDiagram chart={sec.diagram} />}
                {sec.links.length > 0 && (
                  <div style={s.links}>
                    {sec.links.map((l) => (
                      <code key={`${l.path}:${l.label}`} className="mono" title={l.label}>
                        {l.path}
                      </code>
                    ))}
                  </div>
                )}
                {sec.kind === "reading_order" && tour.reading_path.length > 0 && (
                  <>
                    {tour.ranking_basis === "pagerank" && (
                      <p style={s.note}>{t("rankingPagerank")}</p>
                    )}
                    <ol style={s.list}>
                      {tour.reading_path.map((it) => (
                        <li key={it.path}>
                          <code className="mono">{it.path}</code>{" "}
                          <span style={s.muted}>
                            {t("readingScore", { score: it.score.toFixed(2) })}
                            {it.why ? ` — ${it.why}` : ""}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </section>
            ))}

            <div style={s.footer}>
              {tour.status === "skeleton" ? (
                <span>{t("footer.noLlm")}</span>
              ) : (
                <>
                  {tour.model && <span>{t("footer.model", { model: tour.model })}</span>}
                  {tour.tokens_in !== null && tour.tokens_out !== null && (
                    <span>
                      {t("footer.tokens", {
                        tokensIn: formatTokens(tour.tokens_in),
                        tokensOut: formatTokens(tour.tokens_out),
                      })}
                    </span>
                  )}
                  <span>
                    {tour.cost_usd !== null ? formatRunCost(tour.cost_usd) : t("footer.costUnknown")}
                  </span>
                </>
              )}
              <span>{t("footer.generatedAt", { when: formatWhen(tour.generated_at) })}</span>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

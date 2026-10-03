"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { formatRunCost, formatTokens } from "@/components/run-cost-badge";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { useRepos, useResyncRepoIntel } from "@/lib/hooks";
import {
  useGenerateOnboardingTour,
  useOnboardingTour,
} from "@/lib/hooks/onboarding";
import { repoDisplayName } from "@/lib/repo-urls";
import { IN_PROGRESS_REFETCH_MS, SECTION_KINDS } from "./constants";
import { formatWhen, isIndexReason, sectionAnchor } from "./helpers";
import { useCopy } from "./useCopy";
import { SectionCard } from "./_components/SectionCard";
import { SectionContent } from "./_components/SectionContent";
import { TourHeader } from "./_components/TourHeader";
import { TourToc } from "./_components/TourToc";
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
  const baseline = React.useRef<string | undefined>(undefined);
  // D13: while another generation runs, poll until a new tour appears, then clear the banner
  React.useEffect(() => {
    if (!inProgress) return;
    if (tour && tour.generated_at !== baseline.current) {
      setInProgress(false);
      return;
    }
    const id = setInterval(() => refetch(), IN_PROGRESS_REFETCH_MS);
    return () => clearInterval(id);
  }, [inProgress, tour, refetch]);
  const copier = useCopy();
  // AC-51: collapse state is per tour load; a new generated_at starts all-expanded (not persisted)
  const [collapsed, setCollapsed] = React.useState<{
    at: string;
    kinds: string[];
  }>({ at: "", kinds: [] });
  const closed =
    tour && collapsed.at === tour.generated_at ? collapsed.kinds : [];
  const setOpen = (kind: string, open: boolean) =>
    tour &&
    setCollapsed({
      at: tour.generated_at,
      kinds: open ? closed.filter((k) => k !== kind) : [...closed, kind],
    });

  const notCloned =
    repo?.clone_path === null ||
    (generate.error instanceof ApiError &&
      generate.error.code === "repo_not_cloned");

  const run = () => {
    setInProgress(false);
    if (generate.isPending) return; // guard against double submit
    generate.mutate(undefined, {
      onSuccess: () => setInProgress(false),
      onError: (e) => {
        if (e instanceof ApiError && e.code === "generation_in_progress") {
          baseline.current = tour?.generated_at;
          setInProgress(true);
        }
      },
    });
  };

  const fullName = repo?.full_name ?? activeRepo?.full_name;
  const crumb = [
    ...(fullName ? [{ label: fullName, mono: true }] : []),
    { label: t("title") },
  ];
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
        {tour && (
          <TourToc
            onSelect={(kind) => {
              setOpen(kind, true);
              document
                .getElementById(sectionAnchor(kind))
                ?.scrollIntoView?.({ block: "start" });
            }}
          />
        )}
        <div style={s.column}>
          <TourHeader
            repoName={repoDisplayName(fullName, t("repoFallback"))}
            tour={tour}
            disabled={disabled}
            shareFailed={copier.failedKey === "share"}
            onRegenerate={run}
            onShare={() => copier.copy(window.location.href, "share")}
          />
          {/* D30: single page-level live region for Copy / Share confirmations */}
          <div role="status" aria-live="polite" style={s.sr}>
            {copier.copied ? t("copied") : ""}
          </div>

          {notCloned && (
            <div style={s.banner} role="status">
              {t("notCloned")}
            </div>
          )}
          {busy && (
            <div style={s.banner} role="status">
              {inProgress && !generate.isPending
                ? t("alreadyGenerating")
                : t("generating")}
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
                    {t("statusBecause", {
                      status: t(`status.${tour.status}`),
                      reason: t(`reasons.${tour.reason}`),
                    })}
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
              {tour.sections.map((sec) => (
                <SectionCard
                  key={sec.kind}
                  kind={sec.kind}
                  open={!closed.includes(sec.kind)}
                  onToggle={() => setOpen(sec.kind, closed.includes(sec.kind))}
                >
                  <SectionContent
                    sec={sec}
                    tour={tour}
                    repo={repo}
                    copier={copier}
                  />
                </SectionCard>
              ))}

              <div style={s.footer}>
                {tour.status === "skeleton" ? (
                  <span>{t("footer.noLlm")}</span>
                ) : (
                  <>
                    {tour.model && (
                      <span>{t("footer.model", { model: tour.model })}</span>
                    )}
                    {tour.tokens_in !== null && tour.tokens_out !== null && (
                      <span>
                        {t("footer.tokens", {
                          tokensIn: formatTokens(tour.tokens_in),
                          tokensOut: formatTokens(tour.tokens_out),
                        })}
                      </span>
                    )}
                    <span>
                      {tour.cost_usd !== null
                        ? formatRunCost(tour.cost_usd)
                        : t("footer.costUnknown")}
                    </span>
                  </>
                )}
                <span>
                  {t("footer.generatedAt", {
                    when: formatWhen(tour.generated_at),
                  })}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

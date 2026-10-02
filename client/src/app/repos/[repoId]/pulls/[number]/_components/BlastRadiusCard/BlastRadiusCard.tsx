"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Icon, SectionLabel, Badge, Button, Skeleton } from "@devdigest/ui";
import type { RepoProvider } from "@devdigest/shared";
import { useBlastRadius } from "@/lib/hooks/blast";
import { useRepoIntelStatus, useResyncRepoIntel } from "@/lib/hooks/repo-intel";
import { BlastGraph } from "./BlastGraph";
import { BlastTree } from "./BlastTree";
import { PriorPrs } from "./PriorPrs";
import { CALLERS_ICON, ENDPOINT_ICON, CRON_ICON } from "./constants";
import { computeCounts } from "./helpers";
import { s } from "./styles";

type BlastView = "tree" | "graph";

interface BlastRadiusCardProps {
  prId: string | null;
  repoId: string | null | undefined;
  provider: RepoProvider;
  repoFullName: string | null;
  headSha: string | null | undefined;
}

/** Blast radius block for the PR Overview tab — colocated, the only consumer
 *  is OverviewTab. Data comes exclusively through useBlastRadius; the Resync
 *  flow reuses the existing repo-intel hooks (no ad-hoc fetch here). */
export function BlastRadiusCard({ prId, repoId, provider, repoFullName, headSha }: BlastRadiusCardProps) {
  const t = useTranslations("blast");
  const qc = useQueryClient();
  const { data: blast, isLoading, isError } = useBlastRadius(prId);
  const [view, setView] = React.useState<BlastView>("tree");

  // Resync: POST /repos/:id/resync, then poll index-state until
  // lastIndexedSha/updatedAt advances past the value captured at click time
  // (the status enum is terminal-only — completion is only visible as those
  // two fields moving, see hooks/repo-intel.ts), then invalidate the blast
  // query so the card re-fetches against the fresh index.
  const [polling, setPolling] = React.useState(false);
  const baselineRef = React.useRef<{ sha: string; updatedAt: string } | null>(null);
  const resync = useResyncRepoIntel(repoId);
  const indexState = useRepoIntelStatus(repoId, polling);

  React.useEffect(() => {
    if (!polling || !indexState.data) return;
    const baseline = baselineRef.current;
    // ponytail: no baseline captured (index-state hadn't loaded yet at click
    // time) — treat the first value seen as "done" rather than stalling
    // forever; upgrade to a real wait if this proves too eager in practice.
    const advanced =
      baseline == null ||
      indexState.data.lastIndexedSha !== baseline.sha ||
      indexState.data.updatedAt !== baseline.updatedAt;
    if (advanced) {
      setPolling(false);
      qc.invalidateQueries({ queryKey: ["blast", prId] });
    }
  }, [polling, indexState.data, prId, qc]);

  const handleResync = () => {
    baselineRef.current = indexState.data
      ? { sha: indexState.data.lastIndexedSha, updatedAt: indexState.data.updatedAt }
      : null;
    setPolling(true);
    resync.mutate();
  };

  const resyncing = resync.isPending || polling;

  const CallersIcon = Icon[CALLERS_ICON];
  const EndpointIcon = Icon[ENDPOINT_ICON];
  const CronIcon = Icon[CRON_ICON];

  if (isLoading) {
    return <Skeleton height={140} />;
  }

  if (isError) {
    return (
      <section>
        <SectionLabel icon="Zap">{t("title")}</SectionLabel>
        <div style={s.card}>
          <span style={s.error}>{t("error")}</span>
        </div>
      </section>
    );
  }

  if (!blast) return null;

  const counts = computeCounts(blast);
  const hasSymbols = blast.changed_symbols.length > 0;
  const hasCallers = counts.callers > 0;

  return (
    <section>
      <SectionLabel icon="Zap">{t("title")}</SectionLabel>

      <div style={s.card}>
        {blast.degraded && (
          <div style={s.banner}>
            <span style={s.bannerText}>
              <Icon.AlertTriangle size={14} />
              <Badge color="var(--warn)" bg="transparent">
                {t("degraded.badge")}
              </Badge>
              {blast.reason && <span>{t(`degraded.reason.${blast.reason}`)}</span>}
            </span>
            <Button kind="secondary" size="sm" icon="RefreshCw" onClick={handleResync} loading={resyncing}>
              {resyncing ? t("resyncing") : t("resync")}
            </Button>
          </div>
        )}

        <div style={s.summaryRow}>
          <span style={s.stat}>
            <Icon.Code size={14} />
            <span style={s.statValue}>{counts.symbols}</span> {t("stat.symbols")}
          </span>
          <span style={s.stat}>
            <CallersIcon size={14} />
            <span style={s.statValue}>{counts.callers}</span> {t("stat.callers")}
          </span>
          <span style={s.stat}>
            <EndpointIcon size={14} />
            <span style={s.statValue}>{counts.endpoints}</span> {t("stat.endpoints")}
          </span>
          <span style={s.stat}>
            <CronIcon size={14} />
            <span style={s.statValue}>{counts.crons}</span> {t("stat.crons")}
          </span>
          <div style={s.viewToggle} role="group">
            <button
              type="button"
              style={s.viewToggleButton(view === "tree")}
              aria-pressed={view === "tree"}
              onClick={() => setView("tree")}
            >
              {t("view.tree")}
            </button>
            <button
              type="button"
              style={s.viewToggleButton(view === "graph")}
              aria-pressed={view === "graph"}
              onClick={() => setView("graph")}
            >
              {t("view.graph")}
            </button>
          </div>
        </div>

        {!hasSymbols ? (
          <div style={s.empty}>{t("empty.noSymbols")}</div>
        ) : view === "graph" ? (
          <BlastGraph blast={blast} />
        ) : !hasCallers ? (
          <div style={s.empty}>{t("noDownstream", { count: counts.symbols })}</div>
        ) : (
          <div style={s.tree}>
            {blast.downstream.filter((g) => g.callers.length > 0).map((group, i) => (
              <BlastTree
                key={group.symbol}
                defaultOpen={i === 0}
                group={group}
                provider={provider}
                repoFullName={repoFullName ?? ""}
                indexedSha={blast.indexed_sha}
                headSha={headSha}
              />
            ))}
            {/* ponytail: zero-caller symbols collapse into one line; a PR can declare dozens. */}
            {blast.downstream.some((g) => g.callers.length === 0) && (
              <div style={s.empty}>
                {t("noCallersRest", {
                  count: blast.downstream.filter((g) => g.callers.length === 0).length,
                })}
              </div>
            )}
          </div>
        )}

        <PriorPrs prId={prId} provider={provider} repoFullName={repoFullName} />
      </div>
    </section>
  );
}

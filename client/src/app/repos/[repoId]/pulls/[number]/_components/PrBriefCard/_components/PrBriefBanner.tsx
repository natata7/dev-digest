"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { PrBriefMissingInput } from "@devdigest/shared";
import { usePrBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { formatRunCost, formatTokens } from "@/components/run-cost-badge/RunCostBadge";
import { VerdictBanner } from "../../VerdictBanner";
import { isStale, latestVerdictReview, reviewCounts } from "../helpers";
import { s } from "../styles";

/** Verdict-style banner for an existing brief (summary always visible), plus
 *  stale notice / error+Retry / missing-inputs note directly under it. */
export function PrBriefBanner({
  prId,
  headSha,
  noFiles,
}: {
  prId: string | null;
  headSha: string | null | undefined;
  noFiles: boolean;
}) {
  const t = useTranslations("brief");
  const { data: brief } = usePrBrief(prId);
  const { data: reviews } = usePrReviews(prId);
  const gen = useGenerateBrief(prId);
  if (!brief) return null;

  const generate = () => gen.mutate();
  const busy = gen.isPending;
  const review = latestVerdictReview(reviews);
  const g = brief.generation;
  const missing = brief.missing_inputs.map((k: PrBriefMissingInput) => t(`input.${k}`)).join(", ");
  const label = busy ? t("generating") : t("refresh");

  return (
    <div style={s.stack}>
      <VerdictBanner
        verdict={review?.verdict ?? null}
        summary={brief.summary}
        score={review?.score ?? null}
        {...(review ? reviewCounts(review) : { findingsCount: 0, blockers: 0 })}
        actions={
          <Button size="sm" kind="tertiary" icon="RefreshCw" aria-label={label} title={label} onClick={generate} disabled={busy || noFiles} />
        }
        footer={
          <span>
            {t("generation", {
              provider: g.provider,
              model: g.model,
              tokensIn: formatTokens(g.tokens_in),
              tokensOut: formatTokens(g.tokens_out),
              cost: g.cost_usd == null ? t("costUnknown") : formatRunCost(g.cost_usd),
              attempts: g.attempts,
            })}
          </span>
        }
      />
      {isStale(brief, headSha) && (
        <div style={s.notice}>
          <span>{t("stale")}</span>
          <Button size="sm" onClick={generate} disabled={busy}>{t("regenerate")}</Button>
        </div>
      )}
      {gen.isError && (
        <div style={s.row} role="alert">
          <span style={s.error}>{t("error", { message: gen.error.message })}</span>
          <Button size="sm" onClick={generate} disabled={busy || noFiles}>{t("retry")}</Button>
        </div>
      )}
      {missing && <span style={s.muted}>{t("missingInputs", { inputs: missing })}</span>}
    </div>
  );
}

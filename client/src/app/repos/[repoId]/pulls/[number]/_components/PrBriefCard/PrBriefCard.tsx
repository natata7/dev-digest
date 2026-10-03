"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Skeleton } from "@devdigest/ui";
import type { PrBriefMissingInput, Risk } from "@devdigest/shared";
import { usePrBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { formatRunCost, formatTokens } from "@/components/run-cost-badge/RunCostBadge";
import { VerdictBanner } from "../VerdictBanner";
import { SEVERITY_COLOR } from "./constants";
import { isStale, latestVerdictReview, reviewCounts, sortRisks } from "./helpers";
import { s } from "./styles";

interface PrBriefCardProps {
  prId: string | null;
  headSha: string | null | undefined;
  filesCount?: number;
  onOpenFile?: (path: string, line?: number) => void;
}

function RiskItem({ risk, onOpenFile }: { risk: Risk; onOpenFile?: (p: string) => void }) {
  const t = useTranslations("brief");
  const [open, setOpen] = useState(false);
  return (
    <li style={s.risk}>
      <div style={s.row}>
        <span style={s.severity(SEVERITY_COLOR[risk.severity])}>{t(`severity.${risk.severity}`)}</span>
        <span style={s.riskTitle}>{risk.title}</span>
      </div>
      <div style={s.row}>
        {risk.file_refs.map((f) => (
          <button key={f} type="button" style={s.link} aria-label={t("openFile", { file: f })} onClick={() => onOpenFile?.(f)}>
            {f}
          </button>
        ))}
      </div>
      <button type="button" style={s.toggle} aria-expanded={open} onClick={() => setOpen(!open)}>
        {t(open ? "hideExplanation" : "showExplanation")}
      </button>
      {open && <p style={s.explanation}>{risk.explanation}</p>}
    </li>
  );
}

export function PrBriefCard({ prId, headSha, filesCount, onOpenFile }: PrBriefCardProps) {
  const t = useTranslations("brief");
  const { data: brief, isLoading } = usePrBrief(prId);
  const { data: reviews } = usePrReviews(prId);
  const gen = useGenerateBrief(prId);

  const generate = () => gen.mutate();
  const noFiles = filesCount === 0;

  if (isLoading || (gen.isPending && !brief)) {
    return (
      <section>
        <SectionLabel icon="FileText">{t("title")}</SectionLabel>
        <div style={s.card} aria-busy="true" aria-label={t("generating")}>
          <Skeleton height={20} width="40%" />
          <Skeleton height={14} />
          <Skeleton height={14} width="80%" />
        </div>
      </section>
    );
  }

  const errorRow = gen.isError && (
    <div style={s.row} role="alert">
      <span style={s.error}>{t("error", { message: gen.error.message })}</span>
      <Button size="sm" onClick={generate} disabled={gen.isPending || noFiles}>{t("retry")}</Button>
    </div>
  );

  if (!brief) {
    return (
      <section>
        <SectionLabel icon="FileText">{t("title")}</SectionLabel>
        <div style={s.card}>
          <span style={s.muted}>{noFiles ? t("noFiles") : t("emptyHint")}</span>
          <div style={s.row}>
            <Button kind="primary" icon="Sparkles" onClick={generate} disabled={noFiles || gen.isPending}>
              {t("generate")}
            </Button>
          </div>
          {errorRow}
        </div>
      </section>
    );
  }

  const review = latestVerdictReview(reviews);
  const risks = sortRisks(brief.risks.risks);
  const g = brief.generation;
  const missing = brief.missing_inputs.map((k: PrBriefMissingInput) => t(`input.${k}`)).join(", ");
  const busy = gen.isPending;

  return (
    <section>
      <SectionLabel
        icon="FileText"
        right={
          <Button size="sm" kind="ghost" icon="RefreshCw" onClick={generate} disabled={busy || noFiles}>
            {busy ? t("generating") : t("refresh")}
          </Button>
        }
      >
        {t("title")}
      </SectionLabel>
      <div style={s.card}>
        {isStale(brief, headSha) && (
          <div style={s.notice}>
            <span>{t("stale")}</span>
            <Button size="sm" onClick={generate} disabled={busy}>{t("regenerate")}</Button>
          </div>
        )}
        {errorRow}
        {review?.verdict ? (
          <VerdictBanner
            verdict={review.verdict}
            summary={brief.summary}
            score={review.score}
            {...reviewCounts(review)}
          />
        ) : (
          <p style={s.summary}>{brief.summary}</p>
        )}
        {missing && <span style={s.muted}>{t("missingInputs", { inputs: missing })}</span>}

        <div>
          <div style={s.subTitle}>{t("riskAreas")}</div>
          {risks.length === 0 ? (
            <span style={s.muted}>{t("noRiskAreas")}</span>
          ) : (
            <ul style={s.list}>
              {risks.map((r, i) => <RiskItem key={`${r.title}-${i}`} risk={r} onOpenFile={onOpenFile} />)}
            </ul>
          )}
        </div>

        <div>
          <div style={s.subTitle}>{t("reviewFocus")}</div>
          {brief.review_focus.length === 0 ? (
            <span style={s.muted}>{t("noFocus")}</span>
          ) : (
            <ul style={s.list}>
              {brief.review_focus.map((f, i) => (
                <li key={`${f.file}:${f.line}:${i}`} style={s.focusItem}>
                  <button
                    type="button"
                    style={s.link}
                    aria-label={t("openFocus", { file: f.file, line: f.line })}
                    onClick={() => onOpenFile?.(f.file, f.line)}
                  >
                    {f.file}:{f.line}
                  </button>
                  {" — "}
                  {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>

        <span style={s.muted}>
          {t("generation", {
            provider: g.provider,
            model: g.model,
            tokensIn: formatTokens(g.tokens_in),
            tokensOut: formatTokens(g.tokens_out),
            cost: g.cost_usd == null ? t("costUnknown") : formatRunCost(g.cost_usd),
            attempts: g.attempts,
          })}
        </span>
      </div>
    </section>
  );
}

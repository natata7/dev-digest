"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Icon, Skeleton } from "@devdigest/ui";
import type { useGenerateBrief } from "@/lib/hooks/brief";
import { s } from "../styles";

/** Big centred card for "no brief yet" and for the first (pending) generation. */
export function PrBriefEmpty({
  gen,
  loading,
  noFiles,
}: {
  /** The parent's mutation, so pending state is shared (skeleton during first generation). */
  gen: ReturnType<typeof useGenerateBrief>;
  loading: boolean;
  noFiles: boolean;
}) {
  const t = useTranslations("brief");

  if (loading) {
    return (
      <div style={s.card} aria-busy="true" aria-label={t("generating")}>
        <Skeleton height={20} width="40%" />
        <Skeleton height={14} />
        <Skeleton height={14} width="80%" />
      </div>
    );
  }

  return (
    <div style={s.emptyCard}>
      <div style={s.emptyIcon}>
        <Icon.FileText size={22} />
      </div>
      <div style={s.emptyTitle}>{t("emptyTitle")}</div>
      <div style={s.hint}>{noFiles ? t("noFiles") : t("emptyHint")}</div>
      <Button kind="primary" icon="FileText" onClick={() => gen.mutate()} disabled={noFiles || gen.isPending}>
        {t("generate")}
      </Button>
      {gen.isError && (
        <div style={s.row} role="alert">
          <span style={s.error}>{t("error", { message: gen.error.message })}</span>
          <Button size="sm" onClick={() => gen.mutate()} disabled={gen.isPending || noFiles}>
            {t("retry")}
          </Button>
        </div>
      )}
    </div>
  );
}

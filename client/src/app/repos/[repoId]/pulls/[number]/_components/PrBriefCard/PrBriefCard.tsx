"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel } from "@devdigest/ui";
import { usePrBrief, useGenerateBrief } from "@/lib/hooks/brief";
import { PrBriefEmpty } from "./_components/PrBriefEmpty";
import { PrBriefBanner } from "./_components/PrBriefBanner";

interface PrBriefCardProps {
  prId: string | null;
  headSha: string | null | undefined;
  filesCount?: number;
}

/** "PR BRIEF" section head: empty/loading card, or the verdict-style banner.
 *  Risk areas (in IntentCard) and ReviewFocus read the same query cache. */
export function PrBriefCard({ prId, headSha, filesCount }: PrBriefCardProps) {
  const t = useTranslations("brief");
  const { data: brief, isLoading } = usePrBrief(prId);
  const gen = useGenerateBrief(prId);
  const noFiles = filesCount === 0;

  return (
    <section>
      <SectionLabel icon="FileText">{t("title")}</SectionLabel>
      {brief ? (
        <PrBriefBanner prId={prId} headSha={headSha} noFiles={noFiles} />
      ) : (
        <PrBriefEmpty gen={gen} loading={isLoading || gen.isPending} noFiles={noFiles} />
      )}
    </section>
  );
}

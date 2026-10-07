"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { RepoProvider } from "@devdigest/shared";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { PrBriefCard, RiskAreas, ReviewFocus } from "../PrBriefCard";
import { usePrBrief } from "@/lib/hooks/brief";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  headSha: string | null | undefined;
  repoId: string | null | undefined;
  provider: RepoProvider;
  repoFullName: string | null;
  /** Wired by the PR page: opens Files changed on a file (and line). */
  onOpenFile?: (path: string, line?: number) => void;
  /** Number of changed files; 0 disables Generate (AC-33). */
  filesCount?: number;
}

export function OverviewTab({ prBody, prId, headSha, repoId, provider, repoFullName, onOpenFile, filesCount }: OverviewTabProps) {
  const { data: brief } = usePrBrief(prId);
  return (
    <>
      <PrBriefCard prId={prId} headSha={headSha} filesCount={filesCount} />

      {brief && (
        <>
          <div style={s.grid}>
            <IntentCard prId={prId} headSha={headSha}>
              <RiskAreas prId={prId} onOpenFile={onOpenFile} />
            </IntentCard>

            <BlastRadiusCard
              prId={prId}
              repoId={repoId}
              provider={provider}
              repoFullName={repoFullName}
              headSha={headSha}
            />
          </div>
          <ReviewFocus prId={prId} onOpenFile={onOpenFile} />
        </>
      )}

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}

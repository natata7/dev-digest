"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import type { RepoProvider } from "@devdigest/shared";
import { IntentCard } from "../IntentCard";
import { BlastRadiusCard } from "../BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null;
  headSha: string | null | undefined;
  repoId: string | null | undefined;
  provider: RepoProvider;
  repoFullName: string | null;
}

export function OverviewTab({ prBody, prId, headSha, repoId, provider, repoFullName }: OverviewTabProps) {
  return (
    <>
      <IntentCard prId={prId} headSha={headSha} />

      <BlastRadiusCard
        prId={prId}
        repoId={repoId}
        provider={provider}
        repoFullName={repoFullName}
        headSha={headSha}
      />

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}

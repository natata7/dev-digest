"use client";

import React from "react";
import { SectionLabel, Badge, Button, Skeleton, EmptyState } from "@devdigest/ui";
import { usePrIntent, useRecomputeIntent } from "@/lib/hooks/reviews";
import { CONFIDENCE_COLOR, SOURCE_LABEL, SOURCE_ICON } from "./constants";
import { isIntentStale } from "./helpers";
import { s } from "./styles";

interface IntentCardProps {
  prId: string | null;
  headSha: string | null | undefined;
}

/** Why this PR was opened, derived before review (Intent Layer). Colocated:
 *  the only consumer is OverviewTab. Data comes exclusively through the
 *  usePrIntent/useRecomputeIntent hooks — no ad-hoc fetch here. */
export function IntentCard({ prId, headSha }: IntentCardProps) {
  const { data: intent, isLoading } = usePrIntent(prId);
  const recompute = useRecomputeIntent(prId);

  if (isLoading) {
    return <Skeleton height={140} />;
  }

  if (!intent) {
    return (
      <section>
        <SectionLabel icon="Target">Intent</SectionLabel>
        <EmptyState
          icon="Target"
          title="Intent not yet derived"
          body="Classify why this PR was opened — its declared scope — before the review runs."
          cta="Derive intent"
          onCta={() => recompute.mutate()}
          ctaLoading={recompute.isPending}
        />
      </section>
    );
  }

  const stale = isIntentStale(intent, headSha);

  return (
    <section>
      <SectionLabel
        icon="Target"
        right={
          <Badge color={CONFIDENCE_COLOR[intent.confidence]} bg="var(--bg-hover)">
            {intent.confidence} confidence
          </Badge>
        }
      >
        Intent
      </SectionLabel>

      <div style={s.card}>
        {stale && (
          <div style={s.banner}>
            <span>PR updated since this intent was computed.</span>
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              onClick={() => recompute.mutate()}
              loading={recompute.isPending}
            >
              Recompute
            </Button>
          </div>
        )}

        <div style={s.quote}>&ldquo;{intent.intent}&rdquo;</div>

        <div style={s.columns}>
          <div>
            <div style={s.columnTitle}>In scope</div>
            {intent.in_scope.length > 0 ? (
              <ul style={s.list}>
                {intent.in_scope.map((item, i) => (
                  <li key={i} style={s.listItem}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={s.empty}>Nothing stated.</div>
            )}
          </div>
          <div>
            <div style={s.columnTitle}>Out of scope</div>
            {intent.out_of_scope.length > 0 ? (
              <ul style={s.list}>
                {intent.out_of_scope.map((item, i) => (
                  <li key={i} style={s.listItem}>
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <div style={s.empty}>Nothing stated.</div>
            )}
          </div>
        </div>

        {intent.sources.length > 0 && (
          <div style={s.sourceRow}>
            {intent.sources.map((src, i) => (
              <Badge
                key={i}
                icon={src.status === "unavailable" ? "AlertTriangle" : SOURCE_ICON[src.kind]}
                color={src.status === "unavailable" ? "var(--warn)" : "var(--text-secondary)"}
                bg={src.status === "unavailable" ? "var(--warn-bg)" : "var(--bg-hover)"}
              >
                {SOURCE_LABEL[src.kind]} {src.ref}
                {src.status === "unavailable" ? " · unavailable" : ""}
              </Badge>
            ))}
          </div>
        )}

        {!stale && (
          <div style={s.footer}>
            <span />
            <Button
              kind="tertiary"
              size="sm"
              icon="RefreshCw"
              onClick={() => recompute.mutate()}
              loading={recompute.isPending}
            >
              Recompute
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

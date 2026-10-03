"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { Onboarding } from "@devdigest/shared";
import { Badge, Button } from "@devdigest/ui";
import { hasIndex } from "../../helpers";
import { s } from "../../styles";

/** AC-49 header: title, subtitle, Outdated badge, Regenerate, Share link (+ manual-copy fallback, AC-48). */
export function TourHeader({
  repoName,
  tour,
  disabled,
  shareFailed,
  onRegenerate,
  onShare,
}: {
  repoName: string;
  tour: Onboarding | null | undefined;
  disabled: boolean;
  shareFailed: boolean;
  onRegenerate: () => void;
  onShare: () => void;
}) {
  const t = useTranslations("onboarding");
  const format = useFormatter();
  const fieldRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (shareFailed) fieldRef.current?.select();
  }, [shareFailed]);

  const when = tour
    ? format.relativeTime(new Date(tour.generated_at), new Date())
    : "";
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ ...s.header, marginBottom: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={s.h1}>
            {t.rich("heading", {
              name: repoName,
              b: (chunks) => <span style={s.repoName}>{chunks}</span>,
            })}
          </h1>
          {tour && (
            <p style={s.subtitle}>
              {hasIndex(tour.coverage)
                ? t("subtitleIndexed", {
                    count: tour.coverage.files_indexed,
                    when,
                  })
                : t("subtitleNoIndex", { when })}
            </p>
          )}
        </div>
        <div style={s.actions}>
          {tour?.outdated && <Badge>{t("outdated")}</Badge>}
          {tour && (
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              disabled={disabled}
              onClick={onRegenerate}
            >
              {t("regenerate")}
            </Button>
          )}
          <Button kind="secondary" size="sm" icon="Link" onClick={onShare}>
            {t("shareLink")}
          </Button>
        </div>
      </div>
      {shareFailed && (
        <input
          ref={fieldRef}
          readOnly
          aria-label={t("shareManual")}
          value={window.location.href}
          style={s.shareField}
          onFocus={(e) => e.currentTarget.select()}
        />
      )}
    </div>
  );
}

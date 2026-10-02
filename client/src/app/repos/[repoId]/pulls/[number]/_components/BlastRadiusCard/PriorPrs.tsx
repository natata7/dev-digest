"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { RepoProvider } from "@devdigest/shared";
import { usePrHistory } from "@/lib/hooks/blast";
import { repoPrUrl } from "@/lib/repo-urls";
import { PRIOR_PRS_ICON } from "./constants";
import { s } from "./styles";

interface PriorPrsProps {
  prId: string | null;
  provider: RepoProvider;
  repoFullName: string | null;
}

/** "Prior PRs touching these files" — collapsible row at the bottom of the
 *  Blast radius card. Fetches its own history independent of the main
 *  useBlastRadius query: a degraded/errored blast read must not hide it. */
export function PriorPrs({ prId, provider, repoFullName }: PriorPrsProps) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(false);
  const { data, isLoading, isError } = usePrHistory(prId);

  // ponytail: nothing while loading rather than a dedicated skeleton — the
  // row is a low-priority footer, not worth a second loading treatment.
  if (isLoading) return null;

  const HistoryIcon = Icon[PRIOR_PRS_ICON];
  const ChevronIcon = open ? Icon.ChevronDown : Icon.ChevronRight;
  const history = data?.history ?? [];
  const count = history.length;

  return (
    <div style={s.priorWrap}>
      <div style={s.priorDivider} />
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={s.priorHeader}
      >
        <HistoryIcon size={14} />
        <span style={s.priorTitle}>{t("prior.title")}</span>
        <Badge>{count}</Badge>
        <ChevronIcon size={14} />
      </div>

      {open && (
        <div style={s.priorBody}>
          {isError ? (
            <div style={s.empty}>{t("prior.error")}</div>
          ) : count === 0 ? (
            <div style={s.empty}>{t("prior.empty")}</div>
          ) : (
            history.map((item) => (
              <div key={item.pr_number} style={s.priorItem}>
                <a
                  href={repoPrUrl(provider, repoFullName ?? "", item.pr_number)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={s.priorLink}
                >
                  #{item.pr_number} {item.title}
                </a>
                <span style={s.priorMeta}>
                  {t("prior.mergedBy", {
                    date: new Date(item.merged_at).toISOString().slice(0, 10),
                    author: item.author,
                  })}
                </span>
                {item.files_overlap.length > 0 && (
                  <span className="mono" style={s.priorFiles}>
                    {item.files_overlap.join(", ")}
                  </span>
                )}
                {item.notes && <span style={s.priorNotes}>{item.notes}</span>}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

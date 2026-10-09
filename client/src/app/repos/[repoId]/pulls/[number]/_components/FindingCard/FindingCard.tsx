/* FindingCard — ported from findings.jsx (createElement → TSX).
   Severity icon+label, category, file:line, confidence, markdown rationale +
   suggestion, accept/dismiss actions. Accept/dismiss reflect persisted
   timestamps. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  Button,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord, FindingActionKind, RepoProvider } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { lineLabel } from "./helpers";
import { repoBlobUrl } from "../../../../../../../lib/repo-urls";
import { s } from "./styles";

export function FindingCard({
  f,
  focused,
  defaultExpanded,
  onAction,
  pending,
  repoFullName,
  repoProvider,
  headSha,
  onTurnIntoEval,
  evalStatus = "idle",
}: {
  f: FindingRecord;
  focused?: boolean;
  defaultExpanded?: boolean;
  onAction?: (action: FindingActionKind, reply?: string) => void;
  pending?: boolean;
  repoFullName?: string | null;
  repoProvider?: RepoProvider;
  headSha?: string | null;
  /** Create an eval case from this finding. `expectation` is only sent for undecided findings. */
  onTurnIntoEval?: (expectation?: "must_find" | "must_not_flag") => void;
  evalStatus?: "idle" | "pending" | "created" | "exists";
}) {
  const t = useTranslations("prReview");
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? false);
  const [picking, setPicking] = React.useState(false);
  const sevColor = SEV_COLOR[f.severity] ?? SEV_COLOR_FALLBACK;
  const fileHref =
    repoFullName && headSha
      ? repoBlobUrl(repoProvider ?? "github", repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;
  const decided = accepted || dismissed;
  const evalDone = evalStatus === "created" || evalStatus === "exists";
  const evalBusy = evalStatus === "pending" || !!pending;
  const startEval = () => {
    if (evalBusy || evalDone) return;
    if (decided) onTurnIntoEval?.();
    else setPicking((p) => !p);
  };
  const pick = (expectation: "must_find" | "must_not_flag") => {
    setPicking(false);
    onTurnIntoEval?.(expectation);
  };

  return (
    <div data-finding-id={f.id} style={s.card(!!focused, sevColor, muted)}>
      <div onClick={() => setExpanded((e) => !e)} style={s.header}>
        <div style={s.badgeWrap}>
          <SeverityBadge severity={f.severity as Severity} compact />
        </div>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <span style={s.title(muted, dismissed)}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
            {accepted && <span style={s.acceptedTag}>{t("finding.accepted")}</span>}
            {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
          </div>
          <div style={s.metaRow}>
            <MonoLink href={fileHref}>
              {f.file}:{lineLabel(f)}
            </MonoLink>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
        <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={s.prose}>
            <Markdown>{f.rationale}</Markdown>
          </div>
          {f.suggestion && (
            <div style={s.suggestionWrap}>
              <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{f.suggestion}</Markdown>
              </div>
            </div>
          )}

          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={pending}
              active={accepted}
              onClick={() => onAction?.("accept")}
            >
              {t("finding.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              active={dismissed}
              onClick={() => onAction?.("dismiss")}
            >
              {t("finding.dismiss")}
            </Button>
            {onTurnIntoEval && (
              <Button
                kind="ghost"
                size="sm"
                icon="FlaskConical"
                disabled={evalBusy || evalDone}
                onClick={startEval}
              >
                {evalStatus === "created"
                  ? t("finding.evalCreated")
                  : evalStatus === "exists"
                    ? t("finding.evalExists")
                    : t("finding.turnIntoEval")}
              </Button>
            )}
            {picking && (
              <>
                <Button kind="secondary" size="sm" onClick={() => pick("must_find")}>
                  {t("finding.evalPickFind")}
                </Button>
                <Button kind="secondary" size="sm" onClick={() => pick("must_not_flag")}>
                  {t("finding.evalPickNotFlag")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

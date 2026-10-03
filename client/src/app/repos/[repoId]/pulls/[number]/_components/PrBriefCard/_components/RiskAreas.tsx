"use client";

import React, { useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { usePrBrief } from "@/lib/hooks/brief";
import { CardHeader } from "../../CardHeader";
import { SEVERITY_COLOR, SEVERITY_ICON } from "../constants";
import { sortRisks } from "../helpers";
import { s } from "../styles";

function RiskItem({ risk, onOpenFile }: { risk: Risk; onOpenFile?: (p: string) => void }) {
  const t = useTranslations("brief");
  const [open, setOpen] = useState(false);
  const SevIcon = Icon[SEVERITY_ICON[risk.severity]];
  const sev = t(`severity.${risk.severity}`);
  return (
    <li style={s.risk}>
      <div style={s.riskHead}>
        <div style={s.riskBody}>
          <span style={s.riskTitle}>
            <span style={s.severityIcon(SEVERITY_COLOR[risk.severity])} role="img" aria-label={sev} title={sev}>
              <SevIcon size={14} />
            </span>
            {risk.title}
          </span>
          {risk.file_refs.map((f) => (
            <button key={f} type="button" style={s.link} aria-label={t("openFile", { file: f })} onClick={() => onOpenFile?.(f)}>
              {f}
            </button>
          ))}
        </div>
        <button
          type="button"
          style={s.chevron}
          aria-expanded={open}
          aria-label={t(open ? "hideExplanation" : "showExplanation")}
          onClick={() => setOpen(!open)}
        >
          {open ? <Icon.ChevronDown size={14} /> : <Icon.ChevronRight size={14} />}
        </button>
      </div>
      {open && <p style={s.explanation}>{risk.explanation}</p>}
    </li>
  );
}

/** Risk areas from the brief — rendered inside the Intent card (footer slot). */
export function RiskAreas({ prId, onOpenFile }: { prId: string | null; onOpenFile?: (p: string, line?: number) => void }) {
  const t = useTranslations("brief");
  const { data: brief } = usePrBrief(prId);
  if (!brief) return null;
  const risks = sortRisks(brief.risks.risks);
  return (
    <div style={s.stack}>
      <CardHeader icon="AlertTriangle">{t("riskAreas")}</CardHeader>
      {risks.length === 0 ? (
        <span style={s.muted}>{t("noRiskAreas")}</span>
      ) : (
        <ul style={s.list}>
          {risks.map((r, i) => <RiskItem key={`${r.title}-${i}`} risk={r} onOpenFile={onOpenFile} />)}
        </ul>
      )}
    </div>
  );
}

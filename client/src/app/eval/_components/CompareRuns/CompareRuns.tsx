/* CompareRuns — two runs side by side: metric deltas + the system prompt diff (old vs new). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import { deltaPts, money, pct } from "@/components/eval-metrics";
import { useEvalCompare } from "@/lib/hooks/eval";
import { collapseContext, hasChanges, lineDiff } from "./helpers";
import { LINE_BG, s } from "./styles";

const TONE = { up: "var(--ok)", down: "var(--crit)", flat: "var(--text-muted)" } as const;

function Tile({ label, from, to, delta, color, compact }: { label: string; from: string; to: string; delta: number | null; color: string; compact?: boolean }) {
  const d = deltaPts(delta);
  return (
    <div style={s.tile} data-testid={`cmp-${label.toLowerCase()}`}>
      <div style={s.tileLabel}>{label}</div>
      <div style={s.tileRow}>
        <span className="tnum" style={{ ...s.from, ...(compact ? { fontSize: 13 } : {}) }}>{from}</span>
        <span style={s.from}>→</span>
        <span className="tnum" style={{ ...s.to, ...(compact ? { fontSize: 16 } : {}), color }}>{to}</span>
        {d && <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: TONE[d.tone] }}>{d.text}</span>}
      </div>
    </div>
  );
}

/** `older` is the base run, `newer` the candidate (the caller orders them by time). */
export function CompareRuns({ older, newer, onClose }: { older: string; newer: string; onClose: () => void }) {
  const t = useTranslations("eval");
  const q = useEvalCompare(older, newer);
  const cmp = q.data;
  const diff = React.useMemo(() => (cmp ? lineDiff(cmp.a.system_prompt, cmp.b.system_prompt) : []), [cmp]);
  const shown = React.useMemo(() => collapseContext(diff), [diff]);

  return (
    <Modal
      width={940}
      title={cmp ? t("compare.title", { a: cmp.a.agent_version, b: cmp.b.agent_version }) : t("compare.loading")}
      subtitle={cmp ? t("compare.subtitle", { cases: cmp.b.traces_total }) : undefined}
      onClose={onClose}
      footer={<Button kind="secondary" onClick={onClose}>{t("compare.close")}</Button>}
    >
      <div style={s.body}>
        {q.isLoading && <Skeleton height={180} />}
        {q.isError && <ErrorState title={t("compare.failed")} onRetry={() => q.refetch()} />}
        {cmp && (
          <>
            <div style={s.tiles}>
              <Tile label={t("compare.recall")} from={pct(cmp.a.recall)} to={pct(cmp.b.recall)} delta={cmp.delta.recall} color="var(--accent)" />
              <Tile label={t("compare.precision")} from={pct(cmp.a.precision)} to={pct(cmp.b.precision)} delta={cmp.delta.precision} color="var(--ok)" />
              <Tile label={t("compare.citation")} from={pct(cmp.a.citation_accuracy)} to={pct(cmp.b.citation_accuracy)} delta={cmp.delta.citation_accuracy} color="var(--warn, #e8a33d)" />
              <Tile label={t("compare.cost")} from={money(cmp.a.cost_usd)} to={money(cmp.b.cost_usd)} delta={null} color="var(--text-primary)" compact />
            </div>
            <div>
              <div style={s.label}>{t("compare.promptDiff").toUpperCase()}</div>
              <div style={s.legend}>
                <span>{t("compare.oldLabel", { version: cmp.a.agent_version })}</span>
                <span>{t("compare.newLabel", { version: cmp.b.agent_version })}</span>
              </div>
              {hasChanges(diff) ? (
                <div className="mono" style={s.diff} data-testid="prompt-diff">
                  {shown.map((l, i) =>
                    l.kind === "skip" ? (
                      <div key={i} data-kind="skip" style={s.skip}>
                        {t("compare.unchanged", { count: l.count })}
                      </div>
                    ) : (
                      <div key={i} data-kind={l.kind} style={{ background: LINE_BG[l.kind] }}>
                        {l.kind === "add" ? "+ " : l.kind === "del" ? "− " : "  "}
                        {l.text}
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p style={{ ...s.muted, marginTop: 10 }}>{t("compare.identical")}</p>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* EvalsTab — one agent's eval set: latest metrics, cases (Run / Edit / Delete), run-all, run history. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, Icon, IconBtn, Skeleton } from "@devdigest/ui";
import type { EvalCaseRecord } from "@devdigest/shared";
import { MetricTile, money, pct, seconds, when } from "@/components/eval-metrics";
import {
  useAgentEvalDashboard,
  useDeleteEvalCase,
  useEvalCases,
  useRunEvals,
} from "@/lib/hooks/eval";
import { CaseEditorModal } from "./_components/CaseEditorModal";
import { COLOR, KIND_KEY } from "./constants";
import { caseState, passingCount } from "./helpers";
import { s } from "./styles";

const STATE_ICON = { passed: "CheckCircle", failed: "XCircle", error: "AlertTriangle", never: "Slash" } as const;
const STATE_COLOR = {
  passed: "var(--ok)",
  failed: "var(--crit)",
  error: "var(--warn, #e8a33d)",
  never: "var(--text-muted)",
} as const;

export function EvalsTab({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const cases = useEvalCases(agentId);
  const dash = useAgentEvalDashboard(agentId);
  const run = useRunEvals(agentId);
  const del = useDeleteEvalCase(agentId);
  const [editing, setEditing] = React.useState<EvalCaseRecord | "new" | null>(null);
  const [runningCase, setRunningCase] = React.useState<string | null>(null);

  const list = cases.data ?? [];
  const current = dash.data?.current ?? null;
  const delta = dash.data?.delta ?? null;
  const running = run.isPending;

  const runCases = (ids?: string[]) => {
    setRunningCase(ids?.[0] ?? null);
    run.mutate(ids, { onSettled: () => setRunningCase(null) });
  };
  const state = (c: EvalCaseRecord) => caseState(c);

  return (
    <div style={s.wrap}>
      <div>
        <div style={s.sectionHead}>
          <span style={s.label}>{t("evalsTab.metricsTitle").toUpperCase()}</span>
          <Link href={`/eval/${agentId}`} style={s.link}>
            {t("evalsTab.viewDashboard")}
          </Link>
        </div>
        <div style={{ ...s.tiles, marginTop: 12 }}>
          <MetricTile label={t("dashboard.metrics.recall")} value={current?.recall ?? null} delta={delta?.recall} color={COLOR.recall} />
          <MetricTile label={t("dashboard.metrics.precision")} value={current?.precision ?? null} delta={delta?.precision} color={COLOR.precision} />
          <MetricTile label={t("dashboard.metrics.citationAccuracy")} value={current?.citation_accuracy ?? null} delta={delta?.citation_accuracy} color={COLOR.citation} />
          <div data-testid="traces-passed" style={{ flex: 1, background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 9, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", color: "var(--text-muted)" }}>
              {t("evalsTab.tracesPassed").toUpperCase()}
            </div>
            <div className="tnum" style={{ fontSize: 28, fontWeight: 700, marginTop: 10 }}>
              {current ? `${current.traces_passed}/${current.traces_total}` : "—"}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div style={s.casesHead}>
          <span style={s.casesTitle}>{t("evalsTab.casesHeading")}</span>
          {list.length > 0 && (
            <span style={s.pill}>{t("evalsTab.passing", { pass: passingCount(list), total: list.length })}</span>
          )}
          <span style={s.spacer} />
          <Button kind="secondary" icon="Play" loading={running && runningCase == null} disabled={running || list.length === 0} onClick={() => runCases()}>
            {running && runningCase == null ? t("evalsTab.running") : t("evalsTab.runAll")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={() => setEditing("new")}>
            {t("caseEditor.newCase")}
          </Button>
        </div>

        <div style={{ ...s.list, marginTop: 14 }}>
          {cases.isLoading ? (
            <Skeleton height={64} />
          ) : list.length === 0 ? (
            <EmptyState icon="FlaskConical" title={t("evalsTab.emptyCases")} />
          ) : (
            list.map((c) => {
              const st = state(c);
              const I = Icon[STATE_ICON[st]];
              return (
                <div key={c.id} style={s.row} data-testid={`case-${c.name}`}>
                  <I size={18} style={{ color: STATE_COLOR[st] }} />
                  <div style={s.rowMain}>
                    <div className="mono" style={s.rowName}>{c.name}</div>
                    <div style={s.rowSub}>
                      {st === "never"
                        ? t("evalsTab.neverRun")
                        : st === "error"
                          ? t("evalsTab.caseError")
                          : st === "passed"
                            ? t("evalsTab.passed")
                            : t("evalsTab.failed")}
                    </div>
                  </div>
                  <span style={s.kind}>{t(`evalsTab.${KIND_KEY[c.expectation_kind]}`)}</span>
                  <div style={s.actions}>
                    <IconBtn icon="Play" label={t("evalsTab.run")} onClick={() => !running && runCases([c.id])} />
                    <IconBtn icon="Edit" label={t("evalsTab.edit")} onClick={() => setEditing(c)} />
                    <IconBtn
                      icon="Trash"
                      label={t("evalsTab.delete")}
                      onClick={() => {
                        if (!del.isPending && window.confirm(t("evalsTab.deleteConfirm"))) del.mutate(c.id);
                      }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div>
        <div style={s.label}>{t("evalsTab.historyHeading").toUpperCase()}</div>
        {(dash.data?.runs.length ?? 0) === 0 ? (
          <p style={{ ...s.muted, marginTop: 10 }}>{t("evalsTab.noRuns")}</p>
        ) : (
          <table style={{ ...s.table, marginTop: 8 }}>
            <thead>
              <tr>
                {[t("dashboard.table.ranAt"), t("dashboard.version"), t("dashboard.table.recall"), t("dashboard.table.precision"), t("dashboard.table.citation"), t("dashboard.table.pass"), t("dashboard.duration"), t("dashboard.table.cost")].map((h) => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dash.data!.runs.map((r) => (
                <tr key={r.id} data-testid="run-row">
                  <td className="mono" style={s.td}>{when(r.ran_at)}</td>
                  <td style={s.td}>{t("evalsTab.versionShort", { version: r.agent_version })}</td>
                  <td className="tnum" style={s.td}>{pct(r.recall)}</td>
                  <td className="tnum" style={s.td}>{pct(r.precision)}</td>
                  <td className="tnum" style={s.td}>{pct(r.citation_accuracy)}</td>
                  <td className="tnum" style={s.td}>{r.traces_passed}/{r.traces_total}</td>
                  <td className="tnum" style={s.td}>{seconds(r.duration_ms)}</td>
                  <td className="tnum" style={s.td}>{money(r.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <CaseEditorModal
          agentId={agentId}
          existing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

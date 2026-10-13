/* AgentEvalView — one agent on the Eval Dashboard: metrics + deltas, regression alert,
   trend chart, runs table with a two-run Compare. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, Checkbox, EmptyState, ErrorState, Icon, LineChart, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { MetricTile, money, pct, seconds, when } from "@/components/eval-metrics";
import { useAgentEvalDashboard, useRunEvals } from "@/lib/hooks/eval";
import { CompareRuns } from "../CompareRuns";
import { orderPair, series, toggleSelected, yRange } from "./helpers";
import { s } from "./styles";

const C = { recall: "var(--accent)", precision: "var(--ok)", citation: "var(--warn, #e8a33d)" } as const;

export function AgentEvalView({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const q = useAgentEvalDashboard(agentId);
  const run = useRunEvals(agentId);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [comparing, setComparing] = React.useState<[string, string] | null>(null);
  const d = q.data;
  const pair = d ? orderPair(d.runs, selected) : null;

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    { label: d?.agent_name ?? "…" },
  ];

  if (q.isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("dashboard.loadFailed")} onRetry={() => q.refetch()} />
      </AppShell>
    );
  }

  const trend = d?.trend ?? [];
  const lines = [
    { name: t("dashboard.legend.recall"), color: C.recall, data: series(trend, "recall") },
    { name: t("dashboard.legend.precision"), color: C.precision, data: series(trend, "precision") },
    { name: t("dashboard.legend.citation"), color: C.citation, data: series(trend, "citation_accuracy") },
  ];
  const { yMin, yMax } = yRange(lines.flatMap((l) => l.data));

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/eval" style={s.back}>
          <Icon.ChevronLeft size={16} /> {t("dashboard.allAgents")}
        </Link>

        {q.isLoading || !d ? (
          <Skeleton height={320} />
        ) : (
          <>
            <div style={s.head}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <h1 style={s.h1}>{d.agent_name}</h1>
                  <Badge color="var(--text-secondary)" mono>{d.model}</Badge>
                </div>
                <p style={s.sub}>{t("dashboard.agentSubtitle", { runs: d.runs.length, cases: d.cases_total })}</p>
              </div>
              <span style={s.spacer} />
              <Button kind="primary" icon="Play" loading={run.isPending} disabled={run.isPending || d.cases_total === 0} onClick={() => run.mutate(undefined)}>
                {run.isPending ? t("dashboard.running") : t("dashboard.runEval", { count: d.cases_total })}
              </Button>
            </div>

            {d.alert && (
              <div style={s.alert} role="alert" data-testid="eval-alert">
                <Icon.AlertTriangle size={18} style={{ color: "var(--warn, #e8a33d)" }} />
                <span>{d.alert}</span>
              </div>
            )}

            {d.runs.length === 0 ? (
              <EmptyState icon="FlaskConical" title={t("dashboard.noRuns")} />
            ) : (
              <>
                <div style={s.tiles}>
                  <MetricTile label={t("dashboard.metrics.recall")} value={d.current?.recall ?? null} delta={d.delta?.recall} color={C.recall} />
                  <MetricTile label={t("dashboard.metrics.precision")} value={d.current?.precision ?? null} delta={d.delta?.precision} color={C.precision} />
                  <MetricTile label={t("dashboard.metrics.citationAccuracy")} value={d.current?.citation_accuracy ?? null} delta={d.delta?.citation_accuracy} color={C.citation} />
                </div>

                <div style={s.card}>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                    <span style={s.label}>{t("dashboard.metricTrend").toUpperCase()}</span>
                    <span style={s.spacer} />
                    <div style={s.legend}>
                      {lines.map((l) => (
                        <span key={l.name} style={{ color: l.color }}>— {l.name}</span>
                      ))}
                    </div>
                  </div>
                  <LineChart series={lines} w={1200} h={240} yMin={yMin} yMax={yMax} />
                </div>

                <div>
                  <div style={s.runsHead}>
                    <span style={s.label}>{t("dashboard.recentHeading").toUpperCase()}</span>
                    <span style={s.muted}>{t("dashboard.selected", { count: selected.length })}</span>
                    <span style={s.spacer} />
                    <Button kind="primary" icon="Layers" disabled={!pair} onClick={() => pair && setComparing(pair)}>
                      {t("dashboard.compare")}
                    </Button>
                  </div>
                  <div style={s.card}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          <th style={s.th} />
                          {[t("dashboard.table.ranAt"), t("dashboard.version"), t("dashboard.table.recall"), t("dashboard.table.precision"), t("dashboard.table.citation"), t("dashboard.table.pass"), t("dashboard.duration"), t("dashboard.table.cost")].map((h) => (
                            <th key={h} style={s.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {d.runs.map((r) => (
                          <tr key={r.id} data-testid="run-row">
                            <td style={s.td}>
                              <Checkbox checked={selected.includes(r.id)} onChange={() => setSelected((sel) => toggleSelected(sel, r.id))} />
                            </td>
                            <td className="mono" style={s.td}>{when(r.ran_at)}</td>
                            <td style={{ ...s.td, color: "var(--accent)" }}>v{r.agent_version}</td>
                            <td className="tnum" style={s.td}>{pct(r.recall)}</td>
                            <td className="tnum" style={s.td}>{pct(r.precision)}</td>
                            <td className="tnum" style={s.td}>{pct(r.citation_accuracy)}</td>
                            <td className="tnum" style={{ ...s.td, fontWeight: 700 }}>{r.traces_passed}/{r.traces_total}</td>
                            <td className="tnum" style={s.td}>{seconds(r.duration_ms)}</td>
                            <td className="tnum" style={s.td}>{money(r.cost_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
      {comparing && <CompareRuns older={comparing[0]} newer={comparing[1]} onClose={() => setComparing(null)} />}
    </AppShell>
  );
}

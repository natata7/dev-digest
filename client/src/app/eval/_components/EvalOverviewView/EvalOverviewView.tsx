/* EvalOverviewView — /eval: every agent's latest eval metrics + the newest runs across agents. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton, Sparkline } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { pct, when } from "@/components/eval-metrics";
import { useEvalOverview, useRunAllAgents } from "@/lib/hooks/eval";
import { s } from "./styles";

const C = { recall: "var(--accent)", precision: "var(--ok)", citation: "var(--warn, #e8a33d)" } as const;

function Metric({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div style={s.metric}>
      <div style={s.metricLabel}>{label}</div>
      <div className="tnum" style={{ ...s.metricValue, color }}>{pct(value)}</div>
    </div>
  );
}

export function EvalOverviewView() {
  const t = useTranslations("eval");
  const q = useEvalOverview();
  const runAll = useRunAllAgents();
  const data = q.data;
  const runnable = (data?.agents ?? []).filter((a) => a.cases_total > 0).map((a) => a.agent_id);
  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];

  if (q.isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("dashboard.loadFailed")} onRetry={() => q.refetch()} />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.head}>
          <div>
            <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
            <p style={s.sub}>{t("dashboard.subtitle")}</p>
          </div>
          <span style={s.spacer} />
          <Button kind="primary" icon="Play" loading={runAll.isPending} disabled={runAll.isPending || runnable.length === 0} onClick={() => runAll.mutate(runnable)}>
            {runAll.isPending ? t("dashboard.running") : t("dashboard.runAllAgents")}
          </Button>
        </div>

        {q.isLoading || !data ? (
          <Skeleton height={260} />
        ) : data.agents.length === 0 ? (
          <EmptyState icon="Cpu" title={t("dashboard.noAgents")} />
        ) : (
          <>
            <div>
              <span style={s.label}>{t("dashboard.agentsHeading").toUpperCase()}</span>
              <div style={s.list}>
                {data.agents.map((a) => (
                  <Link key={a.agent_id} href={`/eval/${a.agent_id}`} style={s.agent} data-testid={`agent-${a.agent_name}`}>
                    <Icon.Cpu size={20} style={{ color: "var(--accent)" }} />
                    <div style={s.agentMain}>
                      <div style={s.agentName}>
                        {a.agent_name}
                        <Badge color="var(--text-secondary)" mono>{a.model}</Badge>
                      </div>
                      <div style={s.agentSub}>
                        {a.last_run
                          ? t("dashboard.lastRun", {
                              version: a.last_run.agent_version,
                              when: when(a.last_run.ran_at),
                              passed: a.last_run.traces_passed,
                              total: a.last_run.traces_total,
                            })
                          : t("dashboard.neverRun")}
                      </div>
                    </div>
                    {a.trend.length > 1 && <Sparkline data={a.trend.map((v) => v ?? 0)} color={C.recall} w={90} h={26} />}
                    <Metric label={t("dashboard.metricShortRecall")} value={a.last_run?.recall ?? null} color={C.recall} />
                    <Metric label={t("dashboard.metricShortPrecision")} value={a.last_run?.precision ?? null} color={C.precision} />
                    <Metric label={t("dashboard.metricShortCitation")} value={a.last_run?.citation_accuracy ?? null} color={C.citation} />
                    <Icon.ChevronRight size={18} style={{ color: "var(--text-muted)" }} />
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <span style={s.label}>{t("dashboard.recentAll").toUpperCase()}</span>
              <div style={s.card}>
                {data.recent_runs.length === 0 ? (
                  <p style={{ padding: 14, fontSize: 14, color: "var(--text-secondary)" }}>{t("dashboard.noRuns")}</p>
                ) : (
                  <table style={s.table}>
                    <tbody>
                      {data.recent_runs.map((r) => (
                        <tr key={r.id} data-testid="recent-run">
                          <td style={{ ...s.td, fontWeight: 600 }}>{r.agent_name}</td>
                          <td className="mono" style={s.td}>{when(r.ran_at)}</td>
                          <td style={{ ...s.td, color: "var(--accent)" }}>v{r.agent_version}</td>
                          <td className="tnum" style={s.td}>{pct(r.recall)}</td>
                          <td className="tnum" style={s.td}>{pct(r.precision)}</td>
                          <td className="tnum" style={s.td}>{pct(r.citation_accuracy)}</td>
                          <td className="tnum" style={{ ...s.td, fontWeight: 700 }}>{r.traces_passed}/{r.traces_total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

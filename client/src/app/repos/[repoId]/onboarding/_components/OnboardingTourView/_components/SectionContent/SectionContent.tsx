"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { Onboarding, Repo } from "@devdigest/shared";
import { Icon, IconBtn, Markdown } from "@devdigest/ui";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import { COVERAGE_BY_KIND } from "../../constants";
import { isUnavailable, openHref } from "../../helpers";
import { s } from "../../styles";
import css from "../../OnboardingTourView.module.css";

type Section = Onboarding["sections"][number];
type Copier = {
  failedKey: string | null;
  copy: (text: string, key: string) => void;
};

function StepRow({
  index,
  step,
  copier,
}: {
  index: number;
  step: { command: string; note: string | null };
  copier: Copier;
}) {
  const t = useTranslations("onboarding");
  const key = `step-${index}`;
  const failed = copier.failedKey === key;
  const ref = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    // AC-47: select the command text so the user can copy it by hand
    if (failed && ref.current)
      window.getSelection()?.selectAllChildren(ref.current);
  }, [failed]);
  return (
    <div>
      <div style={s.stepRow}>
        <span style={s.stepIndex}>{index + 1}</span>
        <div style={s.stepText}>
          <code
            ref={ref}
            className="mono"
            style={s.ellipsis}
            title={step.command}
          >
            {step.command}
          </code>
          {step.note && (
            <span
              style={{ ...s.muted, ...s.ellipsis, flex: "none" }}
              title={step.note}
            >
              {step.note}
            </span>
          )}
        </div>
        <IconBtn
          icon="Copy"
          label={t("copyCommand")}
          onClick={() => copier.copy(step.command, key)}
        />
      </div>
      {failed && <p style={s.hint}>{t("copyManual")}</p>}
    </div>
  );
}

/** Uniform order (D23): structured rows first, then Markdown body, then diagram. */
export function SectionContent({
  sec,
  tour,
  repo,
  copier,
}: {
  sec: Section;
  tour: Onboarding;
  repo: Pick<Repo, "provider" | "full_name"> | undefined;
  copier: Copier;
}) {
  const t = useTranslations("onboarding");
  const unavailable = isUnavailable(sec); // AC-55: muted text, no rows/controls/diagram
  const notes = COVERAGE_BY_KIND[sec.kind].flatMap((k) =>
    tour.coverage[k].truncated
      ? [
          {
            key: k,
            shown: tour.coverage[k].shown,
            total: tour.coverage[k].total,
          },
        ]
      : [],
  );
  const steps = tour.run_steps ?? [];
  const tasks = tour.first_tasks ?? [];

  return (
    <>
      {notes.map((c) => (
        <p key={c.key} style={s.note}>
          {t("showing", {
            label: t(`coverage.${c.key}`),
            shown: c.shown,
            total: c.total,
          })}
        </p>
      ))}

      {!unavailable &&
        sec.kind === "critical_paths" &&
        sec.links.length > 0 && (
          <div style={s.rows}>
            {sec.links.map((l) => {
              const href = openHref(repo, tour.indexed_sha, l.path);
              const text =
                l.label && l.label !== l.path
                  ? `${l.path} — ${l.label}`
                  : l.path;
              return (
                <div key={`${l.path}:${l.label}`} style={s.row}>
                  <Icon.FileText size={16} />
                  <span className="mono" style={s.ellipsis} title={text}>
                    {text}
                  </span>
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("openPath", { path: l.path })}
                      style={s.openLink}
                    >
                      {t("open")}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

      {!unavailable && sec.kind === "local_run" && steps.length > 0 && (
        <div style={s.rows}>
          {steps.map((step, i) => (
            <StepRow
              key={`${i}:${step.command}`}
              index={i}
              step={step}
              copier={copier}
            />
          ))}
        </div>
      )}

      {!unavailable &&
        sec.kind === "reading_order" &&
        tour.reading_path.length > 0 && (
          <>
            {tour.ranking_basis === "pagerank" && (
              <p style={s.note}>{t("rankingPagerank")}</p>
            )}
            <ol style={s.reading}>
              {tour.reading_path.map((it, i) => (
                <li key={it.path} style={s.readingItem}>
                  <span style={s.badge}>{i + 1}</span>
                  <div style={s.readingBody}>
                    <div className="mono" style={s.ellipsis} title={it.path}>
                      {it.path}
                    </div>
                    {it.why && (
                      <div style={s.mutedEllipsis} title={it.why}>
                        {it.why}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}

      {!unavailable && sec.kind === "first_tasks" && tasks.length > 0 && (
        <div className={css.tasksWrap} style={s.tasksWrapGap}>
          <div className={css.tasks}>
            {tasks.map((task) => (
              <div key={`${task.path}:${task.title}`} style={s.taskCard}>
                <div style={s.taskTitle} title={task.title}>
                  {task.title}
                </div>
                <div
                  className="mono"
                  style={s.mutedEllipsis}
                  title={task.path}
                >
                  {task.path}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AC-36: Markdown only (no raw HTML) */}
      {sec.body.trim() &&
        (unavailable ? (
          <p style={s.muted}>{sec.body}</p>
        ) : (
          <Markdown>{sec.body}</Markdown>
        ))}
      {/* AC-31: invalid diagram renders nothing */}
      {!unavailable && sec.diagram && <MermaidDiagram chart={sec.diagram} />}
    </>
  );
}

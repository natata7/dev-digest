/* ContextDocList — attachable project-context documents (header + filter, drag handle,
   checkbox, name + dir, kind badge, tokens, read-only Preview drawer, "missing" mark).
   Shared by the Agent and Skill Context tabs; fully controlled via `attached`. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, Icon } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { ContextPreviewDrawer } from "./ContextPreviewDrawer";
import { buildRows, filterRows, moveBefore, splitPath, toggle } from "./helpers";
import { KIND_COLOR, s } from "./styles";

export function ContextDocList({
  repoId,
  files,
  attached,
  onChange,
  title,
  countLabel,
  hint,
  previewLabel = false,
  children,
}: {
  repoId: string;
  files: SpecFile[];
  attached: string[];
  onChange: (paths: string[]) => void;
  title: string;
  countLabel: string;
  hint: React.ReactNode;
  /** Agent tab shows "Preview" next to the eye; skill tab shows the eye only. */
  previewLabel?: boolean;
  children?: React.ReactNode;
}) {
  const t = useTranslations("context");
  const [q, setQ] = React.useState("");
  const [dragPath, setDragPath] = React.useState<string | null>(null);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const rows = filterRows(buildRows(files, attached), q);
  const previewFile = files.find((f) => f.path === previewPath) ?? null;

  return (
    <div>
      <div style={s.head}>
        <h2 style={s.title}>{title}</h2>
        <span style={s.count}>{countLabel}</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("docList.filterPlaceholder")}
          aria-label={t("docList.filterPlaceholder")}
          style={s.filter}
        />
      </div>
      <p style={s.hint}>{hint}</p>
      {rows.length === 0 && <p style={s.empty}>{t("docList.empty")}</p>}
      {rows.map((row) => {
        const { dir, name } = splitPath(row.path);
        return (
          <div key={row.path} style={s.rowWrap}>
            <div
              draggable={row.attached}
              onDragStart={() => row.attached && setDragPath(row.path)}
              onDragOver={(e) => {
                if (dragPath && row.attached) e.preventDefault();
              }}
              onDrop={() => {
                if (dragPath) onChange(moveBefore(attached, dragPath, row.path));
                setDragPath(null);
              }}
              style={s.row(row.missing)}
            >
              <span style={s.handle(row.attached)} aria-label={t("docList.reorder")}>
                <Icon.Menu size={16} />
              </span>
              <Checkbox
                checked={row.attached}
                onChange={(on) => onChange(toggle(attached, row.path, on))}
                label={
                  <span>
                    <span className="mono" style={s.name}>
                      {name}
                    </span>{" "}
                    <span className="mono" style={s.dir}>
                      {dir}
                    </span>
                  </span>
                }
              />
              <span style={{ flex: 1 }} />
              {!row.missing && <span style={s.tokens}>{t("docList.tokens", { count: row.tokens })}</span>}
              {row.missing && <span style={s.chip("var(--danger, #ef4444)")}>{t("docList.missing")}</span>}
              {row.kind && <span style={s.chip(KIND_COLOR[row.kind] ?? "var(--text-secondary)")}>{row.kind}</span>}
              {!row.missing && (
                <button
                  type="button"
                  style={s.previewBtn}
                  aria-label={`${t("docList.preview")} ${row.path}`}
                  onClick={() => setPreviewPath(row.path)}
                >
                  <Icon.Eye size={14} />
                  {previewLabel && t("docList.preview")}
                </button>
              )}
            </div>
          </div>
        );
      })}
      {children}
      {previewFile && (
        <ContextPreviewDrawer
          repoId={repoId}
          file={previewFile}
          attached={attached.includes(previewFile.path)}
          onToggle={(on) => onChange(toggle(attached, previewFile.path, on))}
          onClose={() => setPreviewPath(null)}
        />
      )}
    </div>
  );
}

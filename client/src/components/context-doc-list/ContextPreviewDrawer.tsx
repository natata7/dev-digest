/* ContextPreviewDrawer — right-side panel: path, kind, usage, tokens, attach toggle, rendered markdown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, Icon } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";
import { ContextPreview } from "./ContextPreview";
import { KIND_COLOR, s } from "./styles";

export function ContextPreviewDrawer({
  repoId,
  file,
  attached,
  onToggle,
  onClose,
}: {
  repoId: string;
  file: SpecFile;
  attached: boolean;
  onToggle: (on: boolean) => void;
  onClose: () => void;
}) {
  const t = useTranslations("context");
  return (
    <Drawer
      width={840}
      onClose={onClose}
      title={
        <span style={s.drawerTitle}>
          <Icon.FileText size={16} style={{ color: "var(--accent)" }} />
          <span className="mono">{file.path}</span>
        </span>
      }
      subtitle={
        <span style={s.drawerMeta}>
          <span style={s.chip(KIND_COLOR[file.kind] ?? "var(--text-secondary)")}>{file.kind}</span>
          <span style={s.metaItem}>
            <Icon.Cpu size={13} />
            {t("page.usedBy", { count: file.used_by_agents })}
          </span>
          <span className="mono" style={s.metaItem}>
            {t("docList.tokensFull", { count: file.tokens })}
          </span>
        </span>
      }
    >
      <button type="button" style={s.attachBtn} aria-pressed={attached} onClick={() => onToggle(!attached)}>
        {attached && <Icon.Check size={14} />}
        {attached ? t("docList.attached") : t("docList.attach")}
      </button>
      <div style={s.drawerBody}>
        <ContextPreview repoId={repoId} path={file.path} />
      </div>
    </Drawer>
  );
}

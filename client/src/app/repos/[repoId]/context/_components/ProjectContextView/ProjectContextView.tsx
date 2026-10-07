"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, IconBtn, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ContextPreview, splitPath } from "@/components/context-doc-list";
import { useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import { useContextFiles } from "@/lib/hooks/core";
import { s } from "./styles";

/* Read-only: lists discovered context files and previews one. No edit/save. */
export function ProjectContextView() {
  const t = useTranslations("context");
  const { repoId } = useParams<{ repoId: string }>();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch } = useContextFiles(repoId);
  const [selected, setSelected] = React.useState<string | null>(null);

  const files = data?.files ?? [];
  const roots = [...new Set(files.map((f) => splitPath(f.path).dir).filter(Boolean))];
  const current = files.find((f) => f.path === (selected ?? files[0]?.path)) ?? null;
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbContext") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {isLoading && (
          <div style={s.state}>
            <Skeleton height={200} />
          </div>
        )}
        {isError && (
          <div style={s.state}>
            <ErrorState
              title={t("page.loadError")}
              body={error instanceof ApiError ? error.message : t("page.loadError")}
              onRetry={() => refetch()}
            />
          </div>
        )}
        {!isLoading && !isError && files.length === 0 && (
          <EmptyState icon="FileText" title={t("page.empty.title")} body={t("page.empty.body")} />
        )}
        {data && files.length > 0 && (
          <div style={s.split}>
            <div style={s.left}>
              <div style={s.leftHead}>
                <div style={s.label}>{t("page.label")}</div>
                <div className="mono" style={s.root}>
                  {roots.length === 1 ? roots[0] : t("page.rootMany", { count: roots.length })}
                </div>
              </div>
              <div style={s.toolbar}>
                <IconBtn icon="RefreshCw" label={t("page.refresh")} onClick={() => refetch()} />
              </div>
              <div style={s.list}>
                {files.map((f) => {
                  const active = f.path === current?.path;
                  const { dir, name } = splitPath(f.path);
                  return (
                    <button key={f.path} type="button" style={s.item(active)} onClick={() => setSelected(f.path)}>
                      <Icon.FileText size={15} style={s.itemIcon(active)} />
                      <span style={s.itemText}>
                        <span className="mono" style={s.itemPath}>
                          {name}
                        </span>
                        {dir && (
                          <span className="mono" style={s.itemDir}>
                            {dir}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={s.footer}>
                <span style={s.dot} />
                {t("page.footer", { files: files.length, tokens: data.total_tokens })}
              </div>
            </div>
            <div style={s.right}>
              {current ? (
                <>
                  <div style={s.docHead}>
                    <span className="mono" style={s.docPath}>
                      {splitPath(current.path).name}
                    </span>
                    <span style={s.segment}>
                      <span style={s.segmentItem}>{t("page.preview")}</span>
                    </span>
                    <span style={s.usedBy}>
                      <Icon.Cpu size={14} />
                      {t("page.usedBy", { count: current.used_by_agents })}
                    </span>
                  </div>
                  <div style={s.content}>
                    <div style={s.contentInner}>
                      <ContextPreview repoId={repoId} path={current.path} />
                    </div>
                  </div>
                </>
              ) : (
                <p style={s.muted}>{t("page.selectFile")}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

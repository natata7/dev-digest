/* ContextTab — attach project-context documents (from the active repo) to one agent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { ContextDocList, sumTokens } from "@/components/context-doc-list";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextFiles } from "@/lib/hooks/core";
import { useSetAgentContext } from "@/lib/hooks/agents";
import { s } from "./styles";

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("context");
  const { repoId } = useActiveRepo();
  const list = useContextFiles(repoId);
  const save = useSetAgentContext(agent.id);
  // Local state so the token total updates instantly; PUT is fire-and-sync.
  const [paths, setPaths] = React.useState(agent.context_paths);
  const files = list.data?.files ?? [];

  const change = (next: string[]) => {
    setPaths(next);
    save.mutate(next);
  };

  if (!repoId) return <p style={s.hint}>{t("tab.noRepo")}</p>;
  if (list.isLoading) return <Skeleton height={160} />;

  const present = new Set(files.map((f) => f.path));
  const code = (chunks: React.ReactNode) => (
    <code className="mono" style={s.code}>
      {chunks}
    </code>
  );
  return (
    <div style={s.wrap}>
      <ContextDocList
        repoId={repoId}
        files={files}
        attached={paths}
        onChange={change}
        title={t("agentTab.title")}
        countLabel={t("agentTab.attachedCount", { k: paths.filter((p) => present.has(p)).length, n: files.length })}
        hint={t.rich("agentTab.hint", { code })}
        previewLabel
      />
      <div style={s.footer}>
        <span className="mono" style={s.tokens}>
          {t("agentTab.tokens", { tokens: sumTokens(files, paths) })}
        </span>
        <span>{t.rich("agentTab.footer", { code })}</span>
      </div>
    </div>
  );
}

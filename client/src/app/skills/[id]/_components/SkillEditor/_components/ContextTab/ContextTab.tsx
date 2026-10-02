/* ContextTab — attach project-context documents (from the active repo) to one skill. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ContextDocList, serializeGrouped } from "@/components/context-doc-list";
import { useActiveRepo } from "@/lib/repo-context";
import { useContextFiles } from "@/lib/hooks/core";
import { useSetSkillContext } from "@/lib/hooks/skills";
import { s } from "./styles";

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("context");
  const { repoId } = useActiveRepo();
  const list = useContextFiles(repoId);
  const save = useSetSkillContext(skill.id);
  const [paths, setPaths] = React.useState(skill.context_paths);
  const files = list.data?.files ?? [];

  const change = (next: string[]) => {
    setPaths(next);
    save.mutate(next);
  };

  if (!repoId) return <p style={s.hint}>{t("tab.noRepo")}</p>;
  if (list.isLoading) return <Skeleton height={160} />;

  const text = serializeGrouped(files, paths);
  return (
    <div style={s.wrap}>
      <ContextDocList
        repoId={repoId}
        files={files}
        attached={paths}
        onChange={change}
        title={t("skillTab.title")}
        countLabel={t("skillTab.attachedCount", { k: paths.length })}
        hint={t("skillTab.hint")}
      >
        <div style={s.serialize}>
          <div style={s.serializeLabel}>{t("skillTab.serializesAs")}</div>
          <pre className="mono" style={s.pre}>
            {text || t("skillTab.none")}
          </pre>
        </div>
      </ContextDocList>
    </div>
  );
}

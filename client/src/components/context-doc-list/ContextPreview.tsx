/* ContextPreview — read-only rendered markdown of one file (no edit affordance anywhere). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Skeleton } from "@devdigest/ui";
import { useContextFile } from "@/lib/hooks/core";
import { ContextMarkdown } from "./ContextMarkdown";
import { s } from "./styles";

export function ContextPreview({ repoId, path }: { repoId: string; path: string }) {
  const t = useTranslations("context");
  const { data, isLoading, isError } = useContextFile(repoId, path);
  if (isLoading) return <Skeleton height={80} />;
  if (isError || !data) return <p style={s.empty}>{t("docList.previewError")}</p>;
  return <ContextMarkdown>{data.content}</ContextMarkdown>;
}

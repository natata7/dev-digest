"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { usePrBrief } from "@/lib/hooks/brief";
import { CardHeader } from "../../CardHeader";
import { s } from "../styles";

export function ReviewFocus({ prId, onOpenFile }: { prId: string | null; onOpenFile?: (p: string, line?: number) => void }) {
  const t = useTranslations("brief");
  const { data: brief } = usePrBrief(prId);
  if (!brief) return null;
  return (
    <div style={s.card}>
      <CardHeader icon="ListChecks">
        {t("reviewFocus")}
        {brief.review_focus.length > 0 && <span style={s.count}>{brief.review_focus.length}</span>}
      </CardHeader>
      {brief.review_focus.length === 0 ? (
        <span style={s.muted}>{t("noFocus")}</span>
      ) : (
        <ul style={s.list}>
          {brief.review_focus.map((f, i) => (
            <li key={`${f.file}:${f.line}:${i}`} style={s.focusItem}>
              <Icon.ChevronRight size={10} />
              <span>
                <button
                  type="button"
                  style={s.link}
                  aria-label={t("openFocus", { file: f.file, line: f.line })}
                  onClick={() => onOpenFile?.(f.file, f.line)}
                >
                  {f.file}:{f.line}
                </button>
                {" — "}
                {f.reason}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

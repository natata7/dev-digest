"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, MonoLink, Badge } from "@devdigest/ui";
import type { DownstreamImpact, RepoProvider } from "@devdigest/shared";
import { CALLER_ROW_ICON, CRON_ICON, CRON_PILL, ENDPOINT_ICON, ENDPOINT_PILL, SYMBOL_ICON } from "./constants";
import { callerUrl } from "./helpers";
import { s } from "./styles";

/** One collapsible changed-symbol node: chevron + `<>` + `name()` + right-
 *  aligned caller count, expanding to `↳ file:line` caller links followed by
 *  endpoint (blue) and cron (amber) pills, kept visually separate. */
export function BlastTree({
  group,
  provider,
  repoFullName,
  indexedSha,
  headSha,
  defaultOpen = false,
}: {
  group: DownstreamImpact;
  provider: RepoProvider;
  repoFullName: string;
  indexedSha: string | null | undefined;
  headSha: string | null | undefined;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("blast");
  const [open, setOpen] = React.useState(defaultOpen);
  const ChevronIcon = open ? Icon.ChevronDown : Icon.ChevronRight;
  const SymbolIcon = Icon[SYMBOL_ICON];
  const CallerIcon = Icon[CALLER_ROW_ICON];

  return (
    <div style={s.node}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") setOpen((o) => !o);
        }}
        style={s.nodeHeader}
      >
        <ChevronIcon size={14} />
        <SymbolIcon size={13} />
        <span className="mono" style={s.nodeName}>
          {group.symbol}()
        </span>
        <span style={s.nodeCallerCount}>{t("callerCount", { count: group.callers.length })}</span>
      </div>

      {open && (
        <div style={s.nodeBody}>
          {group.callers.length === 0 ? (
            <div style={s.empty}>{t("callerCount", { count: 0 })}</div>
          ) : (
            group.callers.map((caller, i) => (
              <div key={`${caller.file}:${caller.line}:${i}`} style={s.callerRow}>
                <CallerIcon size={12} />
                <MonoLink href={callerUrl(provider, repoFullName, indexedSha, headSha, caller.file, caller.line)}>
                  {caller.file}:{caller.line}
                </MonoLink>
              </div>
            ))
          )}

          {(group.endpoints_affected.length > 0 || group.crons_affected.length > 0) && (
            <div style={s.pillRow}>
              {group.endpoints_affected.map((endpoint) => (
                <Badge key={endpoint} icon={ENDPOINT_ICON} color={ENDPOINT_PILL.color} bg={ENDPOINT_PILL.bg} mono>
                  {endpoint}
                </Badge>
              ))}
              {group.crons_affected.map((cron) => (
                <Badge key={cron} icon={CRON_ICON} color={CRON_PILL.color} bg={CRON_PILL.bg} mono>
                  {cron}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

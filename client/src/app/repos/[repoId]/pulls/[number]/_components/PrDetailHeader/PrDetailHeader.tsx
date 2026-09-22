"use client";

import React from "react";
import { Icon, Avatar, Badge, Button, Tabs } from "@devdigest/ui";
import { RunReviewDropdown } from "../RunReviewDropdown";
import { s } from "./styles";
import type { PrDetail, RepoProvider } from "@/lib/types";
import { platformLabel } from "@/lib/repo-urls";

interface PrDetailHeaderProps {
  pr: PrDetail;
  prId: string | null;
  tab: string;
  findingsCount: number;
  /** Host PR/MR URL; null when the repo's full_name isn't known yet. */
  prUrl?: string | null;
  /** Which code host `prUrl` points at — drives the "View on {platform}" label. */
  provider?: RepoProvider;
  onSetTab: (tab: string) => void;
  onRunStart: () => void;
  onRunsStarted: () => void;
}

export function PrDetailHeader({
  pr,
  prId,
  tab,
  findingsCount,
  prUrl,
  provider = "github",
  onSetTab,
  onRunStart,
  onRunsStarted,
}: PrDetailHeaderProps) {
  const statusColor =
    pr.status === "merged"
      ? "var(--ok)"
      : pr.status === "closed"
        ? "var(--stale)"
        : "var(--warn)";

  // Published as --pr-header-height so anything else that wants to stick
  // below this sticky header (e.g. DiffTab's group headers) knows the real
  // offset — this header's height varies (the stale-PR banner adds a row).
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    // offsetHeight (not contentRect, which excludes padding/border) — this
    // header has both, and the sticky offset needs its real rendered height.
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--pr-header-height", `${el.offsetHeight}px`);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} style={s.root}>
      <div style={s.titleRow}>
        <div style={s.titleCol}>
          <h1 style={s.h1}>
            <span className="mono" style={s.prNumber}>
              #{pr.number}
            </span>
            {pr.title}
          </h1>
          <div style={s.meta}>
            <span style={s.authorChip}>
              <Avatar name={pr.author} size={17} />
              {pr.author}
            </span>
            <span style={s.branchChip}>
              <Icon.GitBranch size={13} style={{ color: "var(--text-muted)" }} />
              <span className="mono" style={s.branchMono}>
                {pr.branch}
              </span>
              <Icon.ArrowRight size={11} />
              <span className="mono" style={s.branchMono}>
                {pr.base}
              </span>
            </span>
            <span className="mono tnum">
              <span style={{ color: "var(--code-add-text)" }}>+{pr.additions}</span>{" "}
              <span style={{ color: "var(--code-del-text)" }}>−{pr.deletions}</span>
            </span>
            <Badge dot bg="transparent" color={statusColor}>
              {pr.status}
            </Badge>
          </div>
        </div>
        <div style={s.actions}>
          <Button
            kind="ghost"
            size="sm"
            icon="ExternalLink"
            disabled={!prUrl}
            onClick={() =>
              prUrl && window.open(prUrl, "_blank", "noopener,noreferrer")
            }
          >
            View on {platformLabel(provider)}
          </Button>
          {prId && (
            <RunReviewDropdown
              prId={prId}
              warnMerged={pr.status === "merged" || pr.status === "closed"}
              onRunStart={onRunStart}
              onRunsStarted={onRunsStarted}
            />
          )}
        </div>
      </div>
      {(pr.status === "merged" || pr.status === "closed") && (
        <div style={s.staleBanner}>
          <Icon.AlertTriangle size={13} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <span>
            This PR is already {pr.status} — running a review is informational and won&apos;t affect the
            merged code.
          </span>
        </div>
      )}
      <Tabs
        value={tab}
        onChange={onSetTab}
        pad="0"
        tabs={[
          { key: "overview", label: "Overview", icon: "FileText" },
          { key: "findings", label: "Agent runs", icon: "AlertOctagon", count: findingsCount || undefined },
          { key: "diff", label: "Files changed", icon: "Code", count: pr.files_count },
        ]}
      />
    </div>
  );
}

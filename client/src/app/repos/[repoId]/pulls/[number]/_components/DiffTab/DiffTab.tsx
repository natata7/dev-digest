"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button, Icon } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi, type DiffFindingApi } from "@/components/diff-viewer";
import {
  usePrComments,
  useCreatePrComment,
  useSmartDiff,
  usePrReviews,
  useFindingAction,
} from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import { platformLabel } from "@/lib/repo-urls";
import type { FindingRecord, PrFile, RepoProvider, SmartDiffRole } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { ROLE_ORDER, DEFAULT_COLLAPSED_ROLES, ROLE_LABEL_KEY } from "./constants";
import { groupFiles, filesWithFindingsCount } from "./helpers";
import { s, chevronFor } from "./styles";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (the host rejects otherwise). */
  canComment?: boolean;
  provider?: RepoProvider;
}

export function DiffTab({ prId, filesCount, files, canComment, provider = "github" }: DiffTabProps) {
  const t = useTranslations("prReview");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff, isLoading: smartDiffLoading, isError: smartDiffError } = useSmartDiff(prId);
  const { data: reviews } = usePrReviews(prId);
  const findingAction = useFindingAction();

  // Comments/findings start hidden so the diff is clean by default — toggle to
  // reveal. One state controls both (one button hides both annotation kinds).
  const [showComments, setShowComments] = React.useState(false);
  const [grouped, setGrouped] = React.useState(true);
  const [collapsedRoles, setCollapsedRoles] = React.useState<Set<SmartDiffRole>>(
    () => new Set(DEFAULT_COLLAPSED_ROLES),
  );

  const commentCount = comments?.length ?? 0;
  const allFindings: FindingRecord[] = React.useMemo(
    () => (reviews ?? []).flatMap((r) => r.findings),
    [reviews],
  );
  const findingsCount = allFindings.length;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    provider,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(
          err instanceof Error ? err.message : `Couldn't post the comment to ${platformLabel(provider)}.`,
        );
        throw err;
      }
    },
  };

  const findingsApi: DiffFindingApi = {
    findings: allFindings,
    show: showComments,
    render: (f) => (
      <FindingCard
        key={f.id}
        f={f}
        pending={findingAction.isPending}
        onAction={(action) => prId && findingAction.mutate({ findingId: f.id, action, prId })}
      />
    ),
  };

  const toggleLabel =
    commentCount > 0 && findingsCount > 0
      ? t(showComments ? "smartDiff.hideCommentsFindings" : "smartDiff.showCommentsFindings")
      : findingsCount > 0
        ? t(showComments ? "smartDiff.hideFindings" : "smartDiff.showFindings", { count: findingsCount })
        : t(showComments ? "smartDiff.hideComments" : "smartDiff.showComments", { count: commentCount });

  const groups = React.useMemo(() => groupFiles(smartDiff, files), [smartDiff, files]);
  const canGroup = grouped && !!smartDiff && !smartDiffError;

  const toggleRole = (role: SmartDiffRole) => {
    setCollapsedRoles((cur) => {
      const next = new Set(cur);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!smartDiffLoading && !smartDiffError && (
              <Button kind="ghost" size="sm" onClick={() => setGrouped((v) => !v)}>
                {grouped ? t("smartDiff.originalOrder") : t("smartDiff.groupedByRole")}
              </Button>
            )}
            {(commentCount > 0 || findingsCount > 0) && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {toggleLabel}
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>

      {reviews && reviews.length === 0 && (
        <div style={s.noReviewHint}>{t("smartDiff.noReviewYet")}</div>
      )}

      {canGroup ? (
        <div style={s.groupsWrap}>
          {ROLE_ORDER.map((role) => {
            const group = groups.find((g) => g.role === role);
            const groupFilesList = group?.files ?? [];
            const withFindings = filesWithFindingsCount(groupFilesList, allFindings);
            const collapsed = collapsedRoles.has(role);
            return (
              <div key={role} style={s.group}>
                <div style={s.groupHeader} onClick={() => toggleRole(role)}>
                  <Icon.ChevronRight size={13} style={chevronFor(!collapsed)} />
                  <span style={s.groupLabel}>{t(`smartDiff.${ROLE_LABEL_KEY[role]}`)}</span>
                  <span style={s.groupCount}>
                    {t("smartDiff.filesCount", { count: groupFilesList.length })}
                  </span>
                  {withFindings > 0 && (
                    <span style={s.groupFindingsCount}>
                      <span style={s.groupFindingDot} />
                      {t("smartDiff.filesWithFindings", { count: withFindings })}
                    </span>
                  )}
                </div>
                {!collapsed && groupFilesList.length > 0 && (
                  <DiffViewer
                    files={groupFilesList}
                    commenting={commenting}
                    findings={findingsApi}
                    defaultOpen={DEFAULT_COLLAPSED_ROLES.includes(role) ? false : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <DiffViewer files={files} commenting={commenting} findings={findingsApi} />
      )}
    </section>
  );
}

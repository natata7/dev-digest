/* CaseEditorModal — create/edit an eval case: name, diff, PR title, expected output JSON. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, Textarea, TextInput } from "@devdigest/ui";
import type { EvalCaseRecord } from "@devdigest/shared";
import { useSaveEvalCase } from "@/lib/hooks/eval";
import { checkExpected, EXPECTED_SKELETON } from "./helpers";
import { s } from "./styles";

export function CaseEditorModal({
  agentId,
  existing,
  onClose,
}: {
  agentId: string;
  existing: EvalCaseRecord | null;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const save = useSaveEvalCase(agentId);
  const [name, setName] = React.useState(existing?.name ?? "");
  const [diff, setDiff] = React.useState(existing?.input_diff ?? "");
  const [title, setTitle] = React.useState((existing?.input_meta as { title?: string } | null)?.title ?? "");
  const [expected, setExpected] = React.useState(
    existing ? JSON.stringify(existing.expected_output, null, 2) : EXPECTED_SKELETON,
  );
  const check = checkExpected(expected);
  const canSave = name.trim().length > 0 && check.ok && !save.isPending;

  const submit = () => {
    if (!check.ok) return;
    save.mutate(
      {
        caseId: existing?.id,
        body: {
          name: name.trim(),
          input_diff: diff,
          input_meta: title ? { title } : null,
          expected_output: check.value,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Modal
      width={980}
      title={existing ? t("caseEditor.caseTitle", { name: existing.name }) : t("caseEditor.newCase")}
      subtitle={t("caseEditor.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("caseEditor.cancel")}
          </Button>
          <Button kind="primary" icon="Check" disabled={!canSave} onClick={submit}>
            {save.isPending ? t("caseEditor.saving") : t("caseEditor.save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.col}>
          <FormField label={t("caseEditor.nameLabel")} required>
            <TextInput value={name} onChange={setName} placeholder={t("caseEditor.namePlaceholder")} mono />
          </FormField>
          <FormField label={t("caseEditor.titleLabel")}>
            <TextInput value={title} onChange={setTitle} placeholder={t("caseEditor.titlePlaceholder")} />
          </FormField>
          <div>
            <div style={s.label}>{t("caseEditor.tabs.diff")}</div>
            <Textarea value={diff} onChange={setDiff} rows={14} mono placeholder={t("caseEditor.diffPlaceholder")} />
          </div>
        </div>
        <div style={s.col}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={s.label}>{t("caseEditor.expectedOutput")}</span>
            <span style={check.ok ? s.ok : s.bad}>{check.ok ? t("caseEditor.validJson") : t("caseEditor.invalidJson")}</span>
          </div>
          <Textarea value={expected} onChange={setExpected} rows={18} mono />
        </div>
      </div>
    </Modal>
  );
}

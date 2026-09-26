"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal, FormField, TextInput, Markdown, Tabs } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import {
  useConfirmSkillImport,
  usePreviewSkillImport,
  usePreviewSkillImportFromUrl,
} from "../../../../../../lib/hooks/skills";
import { DEFAULT_TYPE, MODAL_WIDTH, type ImportMode } from "./constants";
import { dataUrlToBase64, isScanBlocked } from "./helpers";
import { s } from "./styles";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Import-skill modal — File or URL source, preview then confirm. Cancel
 *  persists nothing. The server enforces the injection-scan block regardless
 *  of the source; this UI just avoids a pointless round-trip. */
export function ImportSkillModal({
  onClose,
  initialMode = "file",
}: {
  onClose: () => void;
  initialMode?: ImportMode;
}) {
  const t = useTranslations("skills");
  const previewMut = usePreviewSkillImport();
  const previewUrlMut = usePreviewSkillImportFromUrl();
  const confirmMut = useConfirmSkillImport();
  const [mode, setMode] = React.useState<ImportMode>(initialMode);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [sourceUrl, setSourceUrl] = React.useState<string | null>(null);

  const fetching = previewUrlMut.isPending;
  const blocked = isScanBlocked(preview?.scan);
  const canConfirm =
    !!preview &&
    !blocked &&
    name.trim().length > 0 &&
    description.trim().length > 0 &&
    preview.body.trim().length > 0 &&
    !confirmMut.isPending;

  const resetPreview = () => {
    setPreview(null);
    setName("");
    setDescription("");
    setSourceUrl(null);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const content_base64 = dataUrlToBase64(await readFileAsDataUrl(file));
    const next = await previewMut.mutateAsync({ filename: file.name, content_base64 });
    setSourceUrl(null);
    setPreview(next);
    setName(next.name);
    setDescription(next.description);
  };

  const onFetchUrl = async () => {
    if (!url.trim()) return;
    const next = await previewUrlMut.mutateAsync({ url: url.trim() });
    setSourceUrl(url.trim());
    setPreview(next);
    setName(next.name);
    setDescription(next.description);
  };

  const confirm = async () => {
    if (!canConfirm || !preview) return;
    await confirmMut.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      type: DEFAULT_TYPE,
      body: preview.body,
      ...(sourceUrl ? { source_url: sourceUrl } : {}),
    });
    onClose();
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("importModal.title")}
      subtitle={t("importModal.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("importModal.cancel")}
          </Button>
          <Button kind="primary" icon="Upload" onClick={confirm} disabled={!canConfirm}>
            {confirmMut.isPending ? t("importModal.confirming") : t("importModal.confirm")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.warning}>{t("importModal.warning")}</div>

        <Tabs
          pad="0"
          value={mode}
          onChange={(k) => {
            setMode(k as ImportMode);
            resetPreview();
          }}
          tabs={[
            { key: "file", label: t("importModal.tabFile") },
            { key: "url", label: t("importModal.tabUrl") },
          ]}
        />

        {mode === "file" && (
          <FormField label={t("importModal.pickFile")} required>
            <input
              type="file"
              accept=".md,.zip,.skill,text/markdown,application/zip"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </FormField>
        )}

        {mode === "url" && (
          <FormField label={t("importModal.urlLabel")} required>
            <div style={s.urlRow}>
              <div style={s.urlInput}>
                <TextInput
                  value={url}
                  onChange={setUrl}
                  placeholder={t("importModal.urlPlaceholder")}
                />
              </div>
              <Button kind="secondary" onClick={() => void onFetchUrl()} disabled={fetching || !url.trim()}>
                {fetching ? t("importModal.urlFetching") : t("importModal.urlFetch")}
              </Button>
            </div>
          </FormField>
        )}

        {preview && (
          <>
            <FormField label={t("create.fields.name")} required>
              <TextInput value={name} onChange={setName} />
            </FormField>
            <FormField
              label={t("create.fields.description")}
              required
              hint={t("create.fields.descriptionHint")}
            >
              <TextInput value={description} onChange={setDescription} />
            </FormField>

            {preview.scan && <ScanResultBanner scan={preview.scan} />}

            <div style={s.markdown}>
              <Markdown>{preview.body}</Markdown>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ScanResultBanner({ scan }: { scan: NonNullable<SkillImportPreview["scan"]> }) {
  const t = useTranslations("skills");

  return (
    <div>
      {scan.severity === "clean" && <div style={s.scanClean}>{t("importModal.scanCleanNote")}</div>}

      {scan.severity === "suspicious" && (
        <div style={s.scanSuspicious}>
          <div>{t("importModal.scanSuspiciousTitle")}</div>
          {scan.findings.map((f, i) => (
            <div key={i} style={s.scanFinding}>
              <strong>{f.rule}</strong> — {f.excerpt}
            </div>
          ))}
        </div>
      )}

      {scan.severity === "malicious" && (
        <div style={s.scanMalicious}>
          <div>{t("importModal.scanMaliciousTitle")}</div>
          {scan.findings.map((f, i) => (
            <div key={i} style={s.scanFinding}>
              <strong>{f.rule}</strong> — {f.excerpt}
            </div>
          ))}
        </div>
      )}

      {scan.llm_checked === false && <div style={s.scanDegraded}>{t("importModal.scanDegraded")}</div>}
    </div>
  );
}

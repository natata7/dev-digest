import type { Container } from '../../platform/container.js';
import type {
  Skill,
  SkillImportPreview,
  SkillScanResult,
  SkillSource,
  SkillType,
  SkillVersion,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { PromptCache, hashKey } from '../../platform/model-router.js';
import { assertSafeUrl, safeFetchBytes } from '../../adapters/http/safe-fetch.js';
import { SkillsRepository } from './repository.js';
import { toSkillDto, toSkillVersionDto } from './helpers.js';
import { parseImportedSkill, SkillImportError } from './import.js';
import { scanSkillBody, mergeScans, isBlocked } from './scan.js';
import { scanWithLlmBestEffort } from './scan-llm.js';
import {
  MAX_FETCH_BYTES,
  MAX_IMPORT_REDIRECTS,
  SCAN_VERDICT_TTL_MS,
  URL_FETCH_TIMEOUT_MS,
} from './constants.js';

export { toSkillDto, toSkillVersionDto } from './helpers.js';

/** Cached Level-2 (LLM) scan verdict, keyed by `hashKey(body)` — reused
 *  between preview and confirm so confirm doesn't re-pay the LLM call
 *  (confirm still re-runs the cheap Level-1 regex scan authoritatively, since
 *  the client may have edited the body after preview). */
const scanCache = new PromptCache<SkillScanResult>(SCAN_VERDICT_TTL_MS, Date.now);

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled?: boolean;
  note?: string | null;
  source?: SkillSource;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
  note?: string | null;
}

/**
 * Skills library service. A skill is markdown configuration only (no tools).
 * Config changes are versioned via `skill_versions` (repository).
 */
export class SkillsService {
  private repo: SkillsRepository;
  private container: Container;

  constructor(container: Container) {
    this.container = container;
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return this.toDtos(rows);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    if (!row) return undefined;
    const [dto] = await this.toDtos([row]);
    return dto;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source ?? 'manual',
      body: input.body,
      enabled: input.enabled,
      note: input.note,
    });
    return toSkillDto(row, 0);
  }

  async previewImport(
    workspaceId: string,
    filename: string,
    bytes: Uint8Array,
  ): Promise<SkillImportPreview> {
    const preview = parseImportedSkill(filename, bytes);
    return this.scanPreview(workspaceId, preview);
  }

  async previewImportFromUrl(workspaceId: string, rawUrl: string): Promise<SkillImportPreview> {
    const url = assertSafeUrl(rawUrl);
    const { bytes, filename } = await safeFetchBytes(url, {
      timeoutMs: URL_FETCH_TIMEOUT_MS,
      maxBytes: MAX_FETCH_BYTES,
      maxRedirects: MAX_IMPORT_REDIRECTS,
    });
    const preview = parseImportedSkill(filename, bytes);
    return this.scanPreview(workspaceId, preview);
  }

  /** Level-1 (always) + Level-2 (best-effort) scan, cached by body hash so
   *  `confirmImport` can reuse the Level-2 verdict without re-paying for it. */
  private async scanPreview(
    workspaceId: string,
    preview: SkillImportPreview,
  ): Promise<SkillImportPreview> {
    const level1 = scanSkillBody(preview.body);
    const key = hashKey(preview.body);
    const { value: scan } = await scanCache.wrap(key, () =>
      scanWithLlmBestEffort(this.container, workspaceId, preview.body, level1),
    );
    return { ...preview, scan };
  }

  async confirmImport(
    workspaceId: string,
    input: { name: string; description: string; type: SkillType; body: string; source_url?: string },
  ): Promise<Skill> {
    if (!input.name.trim() || !input.description.trim() || !input.body.trim()) {
      throw new ValidationError('Imported skill requires name, description, and body');
    }

    // Authoritative re-scan — the client may have edited the body since preview.
    // Level 1 always runs; the cached (preview-time, already-merged) verdict is
    // folded back in via mergeScans, never re-calling the LLM here.
    // ponytail: when the body is unchanged since preview, level1's findings get
    // concatenated twice (once fresh, once inside the cached merged result) —
    // cosmetic duplication in the blocked-import error's `findings` list only,
    // doesn't affect `severity`/`isBlocked`. Dedupe by (rule, excerpt) if that
    // list is ever surfaced 1:1 to users and the duplication becomes visible.
    const body = input.body.trim();
    const level1 = scanSkillBody(body);
    const cachedLlm = scanCache.get(hashKey(body));
    const finalScan = cachedLlm ? mergeScans(level1, cachedLlm) : level1;
    if (isBlocked(finalScan)) {
      throw new SkillImportError('Skill body failed the injection scan', { findings: finalScan.findings });
    }

    const row = await this.repo.insert({
      workspaceId,
      name: input.name.trim(),
      description: input.description.trim(),
      type: input.type,
      source: input.source_url ? 'imported_url' : 'imported',
      body,
      enabled: false,
    });
    return toSkillDto(row, 0);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
    });
    if (!row) return undefined;
    const [dto] = await this.toDtos([row]);
    return dto;
  }

  async listVersions(
    workspaceId: string,
    skillId: string,
  ): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map(toSkillVersionDto);
  }

  async getVersion(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<SkillVersion | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const row = await this.repo.getVersion(skillId, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  async restore(
    workspaceId: string,
    skillId: string,
    version: number,
  ): Promise<Skill | undefined> {
    const row = await this.repo.restore(workspaceId, skillId, version);
    if (!row) return undefined;
    const [dto] = await this.toDtos([row]);
    return dto;
  }

  private async toDtos(rows: Awaited<ReturnType<SkillsRepository['list']>>): Promise<Skill[]> {
    const counts = await this.repo.countAgentsBySkillIds(rows.map((r) => r.id));
    return rows.map((r) => toSkillDto(r, counts.get(r.id) ?? 0));
  }
}

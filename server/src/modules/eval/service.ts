import type { EvalCaseInput, EvalCaseRecord, EvalCaseFromFindingResult } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { loadDiff } from '../reviews/diff-loader.js';
import { FRAGMENT_CONTEXT_LINES, MAX_CASES_PER_AGENT, MAX_FRAGMENT_BYTES } from './constants.js';
import {
  caseName,
  cutFragment,
  expectationFor,
  findDuplicate,
  kindOfExpected,
  maskSecrets,
  toCaseRecord,
} from './helpers.js';
import { EvalRepository } from './repository.js';

export type ManualCaseInput = Omit<EvalCaseInput, 'owner_kind' | 'owner_id'>;

export class EvalService {
  constructor(
    private container: Container,
    readonly repo: EvalRepository = new EvalRepository(container.db),
  ) {}

  private async requireAgent(workspaceId: string, agentId: string) {
    const agent = await this.repo.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  // ---- cases -------------------------------------------------------------

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseRecord[]> {
    await this.requireAgent(workspaceId, agentId);
    const rows = await this.repo.listCases(workspaceId, agentId);
    const last = await this.repo.lastRunsByCase(rows.map((r) => r.id));
    return rows.map((r) => toCaseRecord(r, last.get(r.id)));
  }

  async createCase(workspaceId: string, agentId: string, input: ManualCaseInput): Promise<EvalCaseRecord> {
    await this.requireAgent(workspaceId, agentId);
    await this.assertRoom(workspaceId, agentId);
    this.assertFragmentSize(input.input_diff);
    const taken = (await this.repo.listCases(workspaceId, agentId)).map((c) => c.name);
    if (taken.includes(input.name)) throw new ValidationError(`A case named "${input.name}" already exists`);
    const row = await this.repo.insertCase({
      workspaceId,
      agentId,
      name: input.name,
      inputDiff: input.input_diff,
      inputMeta: input.input_meta,
      expected: input.expected_output,
      kind: kindOfExpected(input.expected_output),
      notes: input.notes,
    });
    return toCaseRecord(row);
  }

  async updateCase(workspaceId: string, caseId: string, input: ManualCaseInput): Promise<EvalCaseRecord> {
    const existing = await this.repo.getCase(workspaceId, caseId);
    if (!existing) throw new NotFoundError('Eval case not found');
    this.assertFragmentSize(input.input_diff);
    const clash = (await this.repo.listCases(workspaceId, existing.ownerId)).find(
      (c) => c.name === input.name && c.id !== caseId,
    );
    if (clash) throw new ValidationError(`A case named "${input.name}" already exists`);
    const row = await this.repo.updateCase(workspaceId, caseId, {
      name: input.name,
      inputDiff: input.input_diff,
      inputMeta: input.input_meta,
      expected: input.expected_output,
      kind: kindOfExpected(input.expected_output),
      notes: input.notes,
    });
    return toCaseRecord(row!);
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<void> {
    if (!(await this.repo.deleteCase(workspaceId, caseId))) throw new NotFoundError('Eval case not found');
  }

  // ---- create from a finding (AC-1…AC-7) ---------------------------------

  async createFromFinding(
    workspaceId: string,
    findingId: string,
    requested?: 'must_find' | 'must_not_flag',
  ): Promise<EvalCaseFromFindingResult> {
    const reviews = this.container.reviewRepo;
    const ctx = await reviews.findingContext(findingId);
    if (!ctx || ctx.pull.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');
    const { finding, review, pull } = ctx;

    const agent = review.agentId ? await this.repo.getAgent(workspaceId, review.agentId) : undefined;
    if (!agent) {
      throw new AppError('agent_not_found', 'The agent that produced this finding no longer exists', 409);
    }

    const kind = expectationFor(finding, requested);
    const loc = { file: finding.file, start_line: finding.startLine, end_line: finding.endLine };

    const existing = await this.repo.listCases(workspaceId, agent.id);
    const dup = findDuplicate(existing, kind, loc, findingId);
    if (dup) return { case: toCaseRecord(dup), created: false };
    await this.assertRoom(workspaceId, agent.id);

    const repoRow = await reviews.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');
    const diff = await loadDiff(this.container, reviews, workspaceId, pull, repoRow);
    const cut = cutFragment(diff.raw, finding.file, finding.startLine, finding.endLine, FRAGMENT_CONTEXT_LINES);
    if (!cut) throw new ValidationError('The finding is not inside the PR diff, so it cannot become an eval case');
    const fragment = maskSecrets(cut);
    this.assertFragmentSize(fragment);

    const expected = {
      must_find: kind === 'must_find' ? [{ ...loc, severity: finding.severity, category: finding.category, title: finding.title }] : [],
      must_not_flag: kind === 'must_not_flag' ? [{ ...loc, severity: finding.severity, category: finding.category, title: finding.title }] : [],
    };
    const row = await this.repo.insertCase({
      workspaceId,
      agentId: agent.id,
      name: caseName(finding.title, existing.map((c) => c.name)),
      inputDiff: fragment,
      inputMeta: { title: pull.title, source: 'finding' },
      expected,
      kind,
      sourceFindingId: findingId,
    });
    return { case: toCaseRecord(row), created: true };
  }

  // ---- limits ------------------------------------------------------------

  private async assertRoom(workspaceId: string, agentId: string) {
    if ((await this.repo.countCases(workspaceId, agentId)) >= MAX_CASES_PER_AGENT) {
      throw new ValidationError(`An agent can have at most ${MAX_CASES_PER_AGENT} eval cases`);
    }
  }

  private assertFragmentSize(diff: string) {
    if (Buffer.byteLength(diff, 'utf8') > MAX_FRAGMENT_BYTES) {
      throw new ValidationError(`The diff fragment is larger than ${MAX_FRAGMENT_BYTES / 1024} KB`);
    }
  }
}

import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { ContextFile, ContextList, SpecFile } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { RepoRepository } from '../repos/repository.js';
import { approxTokens, isInsideRoot, kindOf, matchesGlob, skipDir } from './helpers.js';

/**
 * Project Context: read-only discovery/reading of docs inside a repo clone.
 * Every path is vetted (lexical + glob + realpath) before touching the disk.
 */
export class ContextService {
  private repos: RepoRepository;
  private glob: string;

  constructor(private container: Container) {
    this.repos = new RepoRepository(container.db);
    this.glob = container.config.contextGlob;
  }

  private async root(workspaceId: string, repoId: string): Promise<string | null> {
    const repo = await this.repos.getById(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return repo.clonePath ?? null;
  }

  async list(workspaceId: string, repoId: string): Promise<ContextList> {
    const root = await this.root(workspaceId, repoId);
    if (!root) return { files: [], total_tokens: 0 };
    const usage = await this.container.agentsRepo.contextUsage(workspaceId);
    const files: SpecFile[] = [];
    const walk = async (dir: string, prefix: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (!skipDir(e.name)) await walk(join(dir, e.name), rel);
        } else if (e.isFile() && matchesGlob(this.glob, rel)) {
          const kind = kindOf(rel);
          if (!kind) continue;
          try {
            const text = await readFile(join(dir, e.name), 'utf8');
            files.push({
              path: rel,
              kind,
              size: Buffer.byteLength(text),
              tokens: approxTokens(text),
              used_by_agents: usage.get(rel) ?? 0,
            });
          } catch {
            /* unreadable → skip */
          }
        }
      }
    };
    await walk(root, ''); // symlinked dirs/files are not followed (Dirent.isDirectory/isFile are false for links)
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { files, total_tokens: files.reduce((n, f) => n + f.tokens, 0) };
  }

  /** Reads one vetted file; any violation or missing file → NotFoundError (no oracle on why). */
  private async readSafe(root: string, path: string): Promise<string> {
    if (!isInsideRoot(root, path) || !matchesGlob(this.glob, path) || !kindOf(path)) {
      throw new NotFoundError('File not found');
    }
    try {
      const realRoot = await realpath(root);
      const real = await realpath(join(root, path));
      if (!real.startsWith(realRoot + sep)) throw new Error('outside');
      if (!(await stat(real)).isFile()) throw new Error('not a file');
      return await readFile(real, 'utf8');
    } catch {
      throw new NotFoundError('File not found');
    }
  }

  async read(workspaceId: string, repoId: string, path: string): Promise<ContextFile> {
    const root = await this.root(workspaceId, repoId);
    if (!root) throw new NotFoundError('File not found');
    const content = await this.readSafe(root, path);
    return { path, content, tokens: approxTokens(content) };
  }

  /** For run-executor: never throws on bad/missing files, they land in `skipped`. */
  async readDocs(
    workspaceId: string,
    repoId: string,
    paths: string[],
  ): Promise<{
    docs: { path: string; text: string; tokens: number }[];
    skipped: { path: string; reason: 'missing' }[];
  }> {
    const docs: { path: string; text: string; tokens: number }[] = [];
    const skipped: { path: string; reason: 'missing' }[] = [];
    let root: string | null = null;
    try {
      root = await this.root(workspaceId, repoId);
    } catch {
      /* treat as no clone */
    }
    for (const path of paths) {
      try {
        if (!root) throw new Error('no clone');
        const text = await this.readSafe(root, path);
        docs.push({ path, text, tokens: approxTokens(text) });
      } catch {
        skipped.push({ path, reason: 'missing' });
      }
    }
    return { docs, skipped };
  }
}

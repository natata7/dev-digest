import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider } from '../../server/src/adapters/mocks.js';
import { classifyIntent, renderIntentBlock } from '../src/index.js';

/**
 * classifyIntent — the Intent Layer's pure classifier. Hermetic: stub
 * LLMProvider, no network, no DB.
 */
describe('classifyIntent', () => {
  const draft = {
    intent: 'Add rate limiting to the public API',
    in_scope: ['Add a token-bucket limiter middleware'],
    out_of_scope: ['Refactor the auth module'],
    confidence: 'high',
  };

  it('never sends diff-body text — only title/description/sources/hunk headers', async () => {
    const seen: StructuredRequest<unknown>[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
        seen.push(req as StructuredRequest<unknown>);
        return { data: draft as unknown as T, model: req.model, tokensIn: 10, tokensOut: 5, costUsd: 0.0001, raw: '', attempts: 1 };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };

    await classifyIntent({
      title: 'Add rate limiting',
      description: 'Adds a token-bucket limiter.',
      sources: [{ kind: 'linked_issue', ref: '#412', text: 'Users are hitting 500s under load.' }],
      files: [{ path: 'src/api/limiter.ts', hunkHeaders: ['@@ -12,3 +12,7 @@'] }],
      llm: recorder,
      model: 'google/gemini-2.5-flash-lite',
    });

    expect(seen).toHaveLength(1);
    const allText = seen[0]!.messages.map((m) => m.content).join('\n');
    // Every `@@ … @@` occurrence is a real hunk header — no leaked hunk BODY
    // (a hunk body line would put non-header text before/after the markers).
    const headers = allText.match(/@@[^\n]*@@/g) ?? [];
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) expect(h).toMatch(/^@@ -\d+(,\d+)? \+\d+(,\d+)? @@$/);
    expect(allText).not.toContain('diff --git');
    // A real diff hunk body line is "+<code>"/"-<code>" with NO leading space —
    // never confused with our own "- path …" bullet list, which always has a
    // space right after the dash.
    expect(allText).not.toMatch(/^\+\S/m);
    expect(allText).not.toMatch(/^-\S/m);
  });

  it('an unavailable source clamps confidence to low, even when the model reports high', async () => {
    const llm = new MockLLMProvider('openai', { structured: draft });
    const outcome = await classifyIntent({
      title: 'Add rate limiting',
      description: 'Adds a limiter.',
      sources: [{ kind: 'spec', ref: 'docs/specs/rate-limit.md', text: null }],
      files: [{ path: 'src/api/limiter.ts', hunkHeaders: [] }],
      llm,
      model: 'gpt-4.1',
    });

    expect(outcome.intent.confidence).toBe('low');
    expect(outcome.intent.sources).toEqual([
      { kind: 'spec', ref: 'docs/specs/rate-limit.md', status: 'unavailable' },
    ]);
    expect(outcome.sections).toContain('spec:docs/specs/rate-limit.md:unavailable');
  });

  it('empty description falls back to title + files; result is still valid', async () => {
    const llm = new MockLLMProvider('openai', { structured: draft });
    const outcome = await classifyIntent({
      title: 'Add rate limiting',
      description: '   ',
      files: [{ path: 'src/api/limiter.ts', hunkHeaders: ['@@ -1,0 +1,10 @@'] }],
      llm,
      model: 'gpt-4.1',
    });

    expect(outcome.sections).not.toContain('description');
    expect(outcome.sections).toEqual(['title', 'files:1']);
    expect(outcome.intent.intent).toBe(draft.intent);
    expect(outcome.intent.sources).toEqual([]);
    expect(outcome.intent.confidence).toBe('high');
  });

  it('a hunkHeaders entry that is patch text (not a header) throws', async () => {
    const llm = new MockLLMProvider('openai', { structured: draft });
    await expect(
      classifyIntent({
        title: 'Add rate limiting',
        files: [{ path: 'src/api/limiter.ts', hunkHeaders: ['+  const limiter = new Limiter();'] }],
        llm,
        model: 'gpt-4.1',
      }),
    ).rejects.toThrow(/hunk header/);
  });

  it('renderIntentBlock produces plain text with no markdown headers of its own', () => {
    const block = renderIntentBlock({
      intent: 'Add rate limiting',
      in_scope: ['limiter middleware'],
      out_of_scope: [],
      confidence: 'medium',
      sources: [],
    });
    expect(block).toContain('Intent: Add rate limiting');
    expect(block).toContain('- limiter middleware');
    expect(block).toContain('(none stated)');
    expect(block).not.toMatch(/^#/m);
  });
});

/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — ## Declared intent & scope (Intent Layer)', () => {
  it('renders the section + SCOPE_POLICY, right after PR description', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting.',
      intent: 'Intent: add rate limiting\n\nIn scope:\n- limiter middleware',
    });
    const [system, user] = [messages[0]!.content, messages[1]!.content];

    expect(user).toContain('## Declared intent & scope');
    expect(user).toContain('<untrusted source="intent">');
    expect(user).toContain('limiter middleware');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Declared intent & scope'));
    expect(user.indexOf('## Declared intent & scope')).toBeLessThan(user.indexOf('## Diff to review'));

    // SCOPE_POLICY is subordinate to INJECTION_GUARD, never overrides it.
    expect(system).toMatch(/SCOPE POLICY/);
    expect(system).toMatch(/subordinate to the SECURITY rule/i);
    expect(system).toMatch(/never justify hiding, downgrading, or ignoring/i);
    expect(system.indexOf('SECURITY')).toBeLessThan(system.indexOf('SCOPE POLICY'));

    // A genuine WARNING/CRITICAL defect must NEVER be suppressible by declared
    // scope — only SUGGESTION-level style nits may be left out. This is the
    // exact contradiction an architecture review caught in an earlier wording
    // (a "report at most one CRITICAL out-of-scope finding" carve-out silently
    // permitted dropping real WARNING findings and extra CRITICAL ones).
    expect(system).toMatch(/WARNING or CRITICAL.*ALWAYS reported/is);
    expect(system).toMatch(/never omit, downgrade, or merge it away/i);
    expect(system).toMatch(/ONLY findings scope may let you leave out are low-signal SUGGESTION/i);
    expect(system).not.toMatch(/at most one/i);

    expect(assembly.intent).toBe(
      'Intent: add rate limiting\n\nIn scope:\n- limiter middleware',
    );
  });

  it('omits both the section and SCOPE_POLICY when intent is absent — byte-identical to pre-Intent-Layer prompt', () => {
    const withoutIntent = assemblePrompt({ system: 'sys', diff: 'DIFF' });
    const explicitlyEmpty = assemblePrompt({ system: 'sys', diff: 'DIFF', intent: '   ' });

    for (const { messages, assembly } of [withoutIntent, explicitlyEmpty]) {
      expect(messages[1]!.content).not.toContain('## Declared intent & scope');
      expect(messages[0]!.content).not.toMatch(/SCOPE POLICY/);
      expect(assembly.intent ?? null).toBeNull();
    }
    expect(withoutIntent.messages[0]!.content).toBe(explicitlyEmpty.messages[0]!.content);
    expect(withoutIntent.messages[1]!.content).toBe(explicitlyEmpty.messages[1]!.content);
  });
});

import { describe, expect, it } from 'vitest';
import { describePromptSections, skillsPromptArg } from './helpers.js';
import { assemblePrompt } from '../../platform/prompt.js';
import { TEST_QUALITY_SKILL_BODIES } from '../../db/seed-skills.js';

describe('skillsPromptArg', () => {
  it('wraps a non-empty list', () => {
    expect(skillsPromptArg(['a'])).toEqual({ skills: ['a'] });
  });

  it('omits the key when empty', () => {
    expect(skillsPromptArg([])).toEqual({});
  });

  it('spreads Test Quality bodies into assemblePrompt and omits an empty list', () => {
    const on = assemblePrompt({
      system: 's',
      ...skillsPromptArg(TEST_QUALITY_SKILL_BODIES),
      diff: '+ expect(parseAmount("42")).toBe(42)',
    });
    expect(on.assembly.skills).toContain(TEST_QUALITY_SKILL_BODIES[0]);
    expect(on.messages[1]!.content).toContain('## Skills / rules');

    const off = assemblePrompt({ system: 's', ...skillsPromptArg([]), diff: 'd' });
    expect(off.assembly.skills).toBeNull();
  });
});

describe('describePromptSections', () => {
  it('reports name/source/chars for present sections only, plus diff', () => {
    const { assembly } = assemblePrompt({
      system: 'AGENT-SYS',
      prDescription: 'Adds a thing.',
      intent: 'Intent: add a thing',
      diff: 'DIFF-BODY',
    });

    const sections = describePromptSections(assembly, 9);

    // `assembly.system` already includes the appended INJECTION_GUARD/SCOPE_POLICY
    // text (assemblePrompt's job, not this helper's) — assert against the
    // actual assembled length, not the raw input, so this test doesn't pin
    // guard text size.
    expect(sections).toEqual(
      expect.arrayContaining([
        { name: 'system', source: 'agent system prompt', chars: assembly.system.length },
        { name: 'pr_description', source: 'PR title/body', chars: 'Adds a thing.'.length },
        { name: 'intent', source: 'Intent Layer classifier', chars: 'Intent: add a thing'.length },
        { name: 'diff', source: 'git diff', chars: 9 },
      ]),
    );
    // Never present: skills/memory/specs/repo_map/callers weren't supplied.
    expect(sections.map((s) => s.name)).not.toEqual(
      expect.arrayContaining(['skills', 'memory', 'specs', 'repo_map', 'callers']),
    );
  });

  it('never includes the section text itself — only its length', () => {
    const { assembly } = assemblePrompt({
      system: 's',
      prDescription: 'SECRET-LOOKING-DESCRIPTION-TEXT',
      diff: 'd',
    });
    const dump = JSON.stringify(describePromptSections(assembly, 1));
    expect(dump).not.toContain('SECRET-LOOKING-DESCRIPTION-TEXT');
  });

  it('omits a section entirely when absent/blank', () => {
    const { assembly } = assemblePrompt({ system: 's', diff: 'd' });
    const names = describePromptSections(assembly, 1).map((s) => s.name);
    expect(names).toEqual(['system', 'diff']);
  });
});

import { expect, test, describe } from 'vitest';
import { SkillPickedUpScorer } from '../src';

const mockAgentOutput = (
  toolUses: Array<{ name: string; input: Record<string, unknown>; id: string }>,
) =>
  JSON.stringify([
    {
      type: 'assistant',
      message: { content: toolUses.map((t) => ({ type: 'tool_use', ...t })) },
    },
  ]);

const dummyContext = (agentOutput: string) =>
  ({
    workingDir: '/tmp/test',
    diff: '',
    agentOutput,
    promptId: 'test',
    execCommand: async () => ({ score: 0, reason: '' }),
  }) as any;

describe('SkillPickedUpScorer', () => {
  test('returns 1.0 when skill is found', async () => {
    const scorer = new SkillPickedUpScorer('commit');
    const output = mockAgentOutput([
      { name: 'Skill', input: { skill: 'commit' }, id: '1' },
    ]);
    const result = await scorer.evaluate(dummyContext(output));
    expect(result.score).toBe(1.0);
    expect(result.reason).toContain('commit');
  });

  test('returns 0.0 when different skill is found', async () => {
    const scorer = new SkillPickedUpScorer('commit');
    const output = mockAgentOutput([
      { name: 'Skill', input: { skill: 'review-pr' }, id: '1' },
    ]);
    const result = await scorer.evaluate(dummyContext(output));
    expect(result.score).toBe(0.0);
  });

  test('returns 0.0 when no Skill tool used', async () => {
    const scorer = new SkillPickedUpScorer('commit');
    const output = mockAgentOutput([
      { name: 'Bash', input: { command: 'ls' }, id: '1' },
    ]);
    const result = await scorer.evaluate(dummyContext(output));
    expect(result.score).toBe(0.0);
  });

  test('returns 0.0 for empty agent output', async () => {
    const scorer = new SkillPickedUpScorer('commit');
    const result = await scorer.evaluate(dummyContext(''));
    expect(result.score).toBe(0.0);
    expect(result.reason).toBe('Failed to parse agent output');
  });

  test('returns 0.0 for malformed JSON without throwing', async () => {
    const scorer = new SkillPickedUpScorer('commit');
    const result = await scorer.evaluate(dummyContext('not json'));
    expect(result.score).toBe(0.0);
    expect(result.reason).toBe('Failed to parse agent output');
  });

  test('returns 0.0 when no assistant messages exist', async () => {
    const scorer = new SkillPickedUpScorer('commit');
    const output = JSON.stringify([{ type: 'result', subtype: 'success' }]);
    const result = await scorer.evaluate(dummyContext(output));
    expect(result.score).toBe(0.0);
  });

  test('returns 1.0 when one of multiple skills matches', async () => {
    const scorer = new SkillPickedUpScorer('commit');
    const output = mockAgentOutput([
      { name: 'Skill', input: { skill: 'review-pr' }, id: '1' },
      { name: 'Skill', input: { skill: 'commit' }, id: '2' },
    ]);
    const result = await scorer.evaluate(dummyContext(output));
    expect(result.score).toBe(1.0);
  });

  test('returns 1.0 when skill is in second assistant message', async () => {
    const scorer = new SkillPickedUpScorer('commit');
    const output = JSON.stringify([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' }, id: '1' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', name: 'Skill', input: { skill: 'commit' }, id: '2' },
          ],
        },
      },
    ]);
    const result = await scorer.evaluate(dummyContext(output));
    expect(result.score).toBe(1.0);
  });

  test('scorer name includes skill name', () => {
    const scorer = new SkillPickedUpScorer('commit');
    expect(scorer.name).toBe('skill-picked-up:commit');
  });
});

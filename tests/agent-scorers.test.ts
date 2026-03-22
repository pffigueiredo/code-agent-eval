import { expect, test, describe } from 'vitest';
import { scorers } from '../src';

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

describe('skillPickedUp', () => {
  test('returns 1.0 when skill is found', async () => {
    const scorer = scorers.skillPickedUp('commit');
    const output = mockAgentOutput([
      { name: 'Skill', input: { skill: 'commit' }, id: '1' },
    ]);
    const result = await scorer.evaluate(dummyContext(output));
    expect(result.score).toBe(1.0);
    expect(result.reason).toContain('commit');
  });

  test('returns 0.0 when different skill is found', async () => {
    const scorer = scorers.skillPickedUp('commit');
    const output = mockAgentOutput([
      { name: 'Skill', input: { skill: 'review-pr' }, id: '1' },
    ]);
    const result = await scorer.evaluate(dummyContext(output));
    expect(result.score).toBe(0.0);
  });

  test('returns 0.0 when no Skill tool used', async () => {
    const scorer = scorers.skillPickedUp('commit');
    const output = mockAgentOutput([
      { name: 'Bash', input: { command: 'ls' }, id: '1' },
    ]);
    const result = await scorer.evaluate(dummyContext(output));
    expect(result.score).toBe(0.0);
  });

  test('returns 0.0 for empty agent output', async () => {
    const scorer = scorers.skillPickedUp('commit');
    const result = await scorer.evaluate(dummyContext(''));
    expect(result.score).toBe(0.0);
    expect(result.reason).toBe('Failed to parse agent output');
  });

  test('returns 0.0 for malformed JSON without throwing', async () => {
    const scorer = scorers.skillPickedUp('commit');
    const result = await scorer.evaluate(dummyContext('not json'));
    expect(result.score).toBe(0.0);
    expect(result.reason).toBe('Failed to parse agent output');
  });

  test('returns 0.0 when no assistant messages exist', async () => {
    const scorer = scorers.skillPickedUp('commit');
    const output = JSON.stringify([{ type: 'result', subtype: 'success' }]);
    const result = await scorer.evaluate(dummyContext(output));
    expect(result.score).toBe(0.0);
  });

  test('returns 1.0 when one of multiple skills matches', async () => {
    const scorer = scorers.skillPickedUp('commit');
    const output = mockAgentOutput([
      { name: 'Skill', input: { skill: 'review-pr' }, id: '1' },
      { name: 'Skill', input: { skill: 'commit' }, id: '2' },
    ]);
    const result = await scorer.evaluate(dummyContext(output));
    expect(result.score).toBe(1.0);
  });

  test('returns 1.0 when skill is in second assistant message', async () => {
    const scorer = scorers.skillPickedUp('commit');
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
    const scorer = scorers.skillPickedUp('commit');
    expect(scorer.name).toBe('skill-picked-up:commit');
  });
});

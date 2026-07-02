import { expect, test, describe, it } from 'vitest';
import { evalConfigSchema } from '../src/eval-config-loader';
import { jsonConfigSchema } from '../src/scorers/schema';
import { BuildSuccessScorer, SkillPickedUpScorer } from '../src';

describe('Zod schema with class-based scorers', () => {
  const baseConfig = {
    name: 'test',
    prompts: [{ id: 'v1', prompt: 'test' }],
    projectDir: '.',
  };

  test('BuildSuccessScorer passes evalConfigSchema', () => {
    const result = evalConfigSchema.safeParse({
      ...baseConfig,
      scorers: [new BuildSuccessScorer()],
    });
    expect(result.success).toBe(true);
  });

  test('SkillPickedUpScorer passes evalConfigSchema and preserves instance', () => {
    const scorer = new SkillPickedUpScorer('commit');
    const result = evalConfigSchema.safeParse({
      ...baseConfig,
      scorers: [scorer],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    // z.custom passes the original object through — no stripping
    const parsedScorer = result.data.scorers![0];
    expect(parsedScorer).toBe(scorer);
  });

  test('SkillPickedUpScorer evaluate works after schema validation', async () => {
    const scorer = new SkillPickedUpScorer('commit');
    const result = evalConfigSchema.safeParse({
      ...baseConfig,
      scorers: [scorer],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const parsedScorer = result.data.scorers![0];
    const ctx = {
      workingDir: '/tmp',
      diff: '',
      agentOutput: '[]',
      promptId: 'test',
      execCommand: async () => ({ score: 0, reason: '' }),
    } as any;

    const evalResult = await parsedScorer.evaluate(ctx);
    expect(evalResult.score).toBe(0.0);
    expect(evalResult.reason).toBe("Skill 'commit' was not invoked");
  });

  test('plain object scorer still passes validation', () => {
    const result = evalConfigSchema.safeParse({
      ...baseConfig,
      scorers: [{ name: 'custom', evaluate: async () => ({ score: 1, reason: 'ok' }) }],
    });
    expect(result.success).toBe(true);
  });

  test('invalid scorer is rejected', () => {
    const result = evalConfigSchema.safeParse({
      ...baseConfig,
      scorers: [{ name: 'bad' }],
    });
    expect(result.success).toBe(false);
  });
});

describe('jsonConfigSchema (JSON path)', () => {
  const base = { name: 'x', prompts: [{ id: 'v1', prompt: 'p' }], projectDir: '.' };

  it('accepts build + command specs', () => {
    const r = jsonConfigSchema.safeParse({
      ...base,
      scorers: [{ type: 'build' }, { type: 'command', name: 'tc', command: 'npm', args: ['run', 'typecheck'] }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown top-level key', () => {
    expect(jsonConfigSchema.safeParse({ ...base, iteration: 5 }).success).toBe(false);
  });

  it('rejects unknown scorer key', () => {
    expect(jsonConfigSchema.safeParse({ ...base, scorers: [{ type: 'build', nope: 1 }] }).success).toBe(false);
  });

  it('rejects command missing name', () => {
    expect(jsonConfigSchema.safeParse({ ...base, scorers: [{ type: 'command', command: 'npm' }] }).success).toBe(false);
  });

  it('rejects unknown scorer type', () => {
    expect(jsonConfigSchema.safeParse({ ...base, scorers: [{ type: 'nope' }] }).success).toBe(false);
  });

  it('permits and ignores $schema', () => {
    const r = jsonConfigSchema.safeParse({ $schema: 'https://x/schema.json', ...base });
    expect(r.success).toBe(true);
  });
});

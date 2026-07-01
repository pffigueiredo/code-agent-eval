import { expect, test, describe } from 'vitest';
import type { EvalConfig, ExecutionConfig, ExecutionMode } from '../src';

describe('Type Exports', () => {
  test('basic types are exported', () => {
    // Verify that types can be imported
    const config: EvalConfig = {
      name: 'test',
      prompts: [{ id: 'default', prompt: 'test prompt' }],
      projectDir: '/tmp/test',
    };

    expect(config.name).toBe('test');
  });

  test('ExecutionConfig type can be used', () => {
    const config: ExecutionConfig = { mode: 'sequential' };
    expect(config.mode).toBe('sequential');
  });

  test('ExecutionMode type can be used', () => {
    const mode: ExecutionMode = 'parallel';
    expect(mode).toBe('parallel');
  });

  test('EvalConfig includes iterations field', () => {
    const config: EvalConfig = {
      name: 'test',
      prompts: [{ id: 'default', prompt: 'test' }],
      projectDir: '.',
      iterations: 3,
    };
    expect(config.iterations).toBe(3);
  });

  test('EvalConfig includes execution field', () => {
    const config: EvalConfig = {
      name: 'test',
      prompts: [{ id: 'default', prompt: 'test' }],
      projectDir: '.',
      iterations: 5,
      execution: { mode: 'parallel-limit', concurrency: 3 },
    };
    expect(config.execution?.mode).toBe('parallel-limit');
    expect(config.execution?.concurrency).toBe(3);
  });
});

describe('Scorers Export', () => {
  test('scorer classes are exported', async () => {
    const { BaseScorer, BuildSuccessScorer, TestSuccessScorer, LintSuccessScorer, SkillPickedUpScorer } = await import('../src');

    expect(BaseScorer).toBeDefined();
    expect(BuildSuccessScorer).toBeDefined();
    expect(TestSuccessScorer).toBeDefined();
    expect(LintSuccessScorer).toBeDefined();
    expect(SkillPickedUpScorer).toBeDefined();
  });

  test('built-in scorers are instances of BaseScorer', async () => {
    const { BaseScorer, BuildSuccessScorer, TestSuccessScorer, LintSuccessScorer, SkillPickedUpScorer } = await import('../src');

    expect(new BuildSuccessScorer()).toBeInstanceOf(BaseScorer);
    expect(new TestSuccessScorer()).toBeInstanceOf(BaseScorer);
    expect(new LintSuccessScorer()).toBeInstanceOf(BaseScorer);
    expect(new SkillPickedUpScorer('test')).toBeInstanceOf(BaseScorer);
  });
});

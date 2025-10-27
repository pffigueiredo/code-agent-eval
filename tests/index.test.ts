import { expect, test, describe } from 'vitest';
import type { EvalConfig, ExecutionConfig, ExecutionMode } from '../src';

describe('Type Exports', () => {
  test('basic types are exported', () => {
    // Verify that types can be imported
    const config: EvalConfig = {
      name: 'test',
      prompt: 'test prompt',
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
      prompt: 'test',
      projectDir: '.',
      iterations: 3,
    };
    expect(config.iterations).toBe(3);
  });

  test('EvalConfig includes execution field', () => {
    const config: EvalConfig = {
      name: 'test',
      prompt: 'test',
      projectDir: '.',
      iterations: 5,
      execution: { mode: 'parallel-limit', concurrency: 3 },
    };
    expect(config.execution?.mode).toBe('parallel-limit');
    expect(config.execution?.concurrency).toBe(3);
  });
});

describe('Scorers Export', () => {
  test('scorers are exported', async () => {
    const { scorers } = await import('../src');

    // Verify scorers are available
    expect(scorers).toBeDefined();
    expect(typeof scorers.buildSuccess).toBe('function');
    expect(typeof scorers.testSuccess).toBe('function');
    expect(typeof scorers.lintSuccess).toBe('function');
  });
});

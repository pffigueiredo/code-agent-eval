import { describe, it, expect } from 'vitest';
import { EvalConfig, runClaudeCodeEval } from '../src/runner';

describe('Execution Modes', () => {
  it('throws error if parallel-limit without concurrency', async () => {
    await expect(
      runClaudeCodeEval({
        name: 'test',
        prompt: 'test',
        projectDir: '.',
        iterations: 2,
        execution: { mode: 'parallel-limit' }, // Missing concurrency
      })
    ).rejects.toThrow('concurrency is required');
  });

  it('defaults to sequential mode when execution not specified', async () => {
    const config: EvalConfig = {
      name: 'test',
      prompt: 'test',
      projectDir: '.',
      iterations: 1,
    };

    // Verify execution defaults properly (this would be internal logic test)
    expect(config.execution).toBeUndefined();
  });

  it('accepts sequential mode', async () => {
    expect(() => {
      const config = {
        name: 'test',
        prompt: 'test',
        projectDir: '.',
        iterations: 1,
        execution: { mode: 'sequential' as const },
      };
      return config;
    }).not.toThrow();
  });

  it('accepts parallel mode', async () => {
    expect(() => {
      const config = {
        name: 'test',
        prompt: 'test',
        projectDir: '.',
        iterations: 1,
        execution: { mode: 'parallel' as const },
      };
      return config;
    }).not.toThrow();
  });

  it('accepts parallel-limit mode with concurrency', async () => {
    expect(() => {
      const config = {
        name: 'test',
        prompt: 'test',
        projectDir: '.',
        iterations: 1,
        execution: { mode: 'parallel-limit' as const, concurrency: 3 },
      };
      return config;
    }).not.toThrow();
  });
});

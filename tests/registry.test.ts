import { describe, it, expect } from 'vitest';
import { compileScorer } from '../src/scorers/registry';
import type { ScorerContext } from '../src/types';

const ctx = (over: Partial<ScorerContext> = {}): ScorerContext => ({
  workingDir: '/tmp',
  diff: '',
  agentOutput: '[]',
  promptId: 't',
  execCommand: async () => ({ score: 1, reason: 'ok' }),
  ...over,
});

describe('compileScorer', () => {
  it('build/test/lint compile to named Scorers', () => {
    expect(compileScorer({ type: 'build' }).name).toBe('build');
    expect(compileScorer({ type: 'test' }).name).toBe('test');
    expect(compileScorer({ type: 'lint' }).name).toBe('lint');
  });

  it('command forwards args to execCommand', async () => {
    let received: any;
    const s = compileScorer({ type: 'command', name: 'tc', command: 'npm', args: ['run', 'typecheck'] });
    expect(s.name).toBe('tc');
    await s.evaluate(ctx({ execCommand: async (o) => ((received = o), { score: 1, reason: 'ok' }) }));
    expect(received).toMatchObject({ command: 'npm', args: ['run', 'typecheck'] });
  });
});

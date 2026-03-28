import { expect, test, describe } from 'vitest';
import { BaseScorer } from '../src/scorers/base';
import type { Scorer, ScorerContext, ScorerResult } from '../src/types';

class TestScorer extends BaseScorer {
  readonly name = 'test';
  async evaluate(_context: ScorerContext): Promise<ScorerResult> {
    return { score: 1.0, reason: 'ok' };
  }
}

describe('BaseScorer', () => {
  test('concrete subclass can be instantiated and returns result', async () => {
    const scorer = new TestScorer();
    const ctx = {
      workingDir: '/tmp/test',
      diff: '',
      agentOutput: '',
      promptId: 'test',
      execCommand: async () => ({ score: 0, reason: '' }),
    } as ScorerContext;
    const result = await scorer.evaluate(ctx);
    expect(result.score).toBe(1.0);
    expect(result.reason).toBe('ok');
  });

  test('concrete subclass satisfies Scorer interface', () => {
    const scorer: Scorer = new TestScorer();
    expect(scorer.name).toBe('test');
    expect(typeof scorer.evaluate).toBe('function');
  });
});

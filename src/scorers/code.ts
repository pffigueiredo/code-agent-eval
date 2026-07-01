import type { ScorerContext, ScorerResult } from '../types';
import { BaseScorer } from './base';

/**
 * Scorer that runs `npm run build` and scores 1.0 if successful, 0.0 if it fails.
 * Uses a 5-minute timeout.
 */
export class BuildSuccessScorer extends BaseScorer {
  readonly name = 'build';
  async evaluate({ execCommand }: ScorerContext): Promise<ScorerResult> {
    return execCommand({
      command: 'npm',
      args: ['run', 'build'],
      timeout: 300000, // 5 minutes
      successMessage: 'Build passed',
    });
  }
}

/**
 * Scorer that runs `npm run test` and scores 1.0 if successful, 0.0 if it fails.
 * Uses a 5-minute timeout.
 */
export class TestSuccessScorer extends BaseScorer {
  readonly name = 'test';
  async evaluate({ execCommand }: ScorerContext): Promise<ScorerResult> {
    return execCommand({
      command: 'npm',
      args: ['run', 'test'],
      timeout: 300000, // 5 minutes
      successMessage: 'Tests passed',
    });
  }
}

/**
 * Scorer that runs `npm run lint` and scores 1.0 if successful, 0.0 if it fails.
 * Uses a 1-minute timeout.
 */
export class LintSuccessScorer extends BaseScorer {
  readonly name = 'lint';
  async evaluate({ execCommand }: ScorerContext): Promise<ScorerResult> {
    return execCommand({
      command: 'npm',
      args: ['run', 'lint'],
      timeout: 60000, // 1 minute
      successMessage: 'Lint passed',
    });
  }
}

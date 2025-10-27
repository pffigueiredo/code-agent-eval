import type { Scorer } from '../types';
import { createScorer } from './factories';

/**
 * Creates a scorer that runs `npm run build` and scores 1.0 if successful, 0.0 if it fails.
 * Uses a 5-minute timeout.
 */
export function buildSuccess(): Scorer {
  return createScorer('build', ({ execCommand }) =>
    execCommand({
      command: 'npm',
      args: ['run', 'build'],
      timeout: 300000, // 5 minutes
      successMessage: 'Build passed',
    })
  );
}

/**
 * Creates a scorer that runs `npm run test` and scores 1.0 if successful, 0.0 if it fails.
 * Uses a 5-minute timeout.
 */
export function testSuccess(): Scorer {
  return createScorer('test', ({ execCommand }) =>
    execCommand({
      command: 'npm',
      args: ['run', 'test'],
      timeout: 300000, // 5 minutes
      successMessage: 'Tests passed',
    })
  );
}

/**
 * Creates a scorer that runs `npm run lint` and scores 1.0 if successful, 0.0 if it fails.
 * Uses a 1-minute timeout.
 */
export function lintSuccess(): Scorer {
  return createScorer('lint', ({ execCommand }) =>
    execCommand({
      command: 'npm',
      args: ['run', 'lint'],
      timeout: 60000, // 1 minute
      successMessage: 'Lint passed',
    })
  );
}

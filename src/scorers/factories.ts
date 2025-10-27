import { execa } from 'execa';
import type { Scorer, ScorerContext, ScorerResult, ExecCommandOptions } from '../types';

/**
 * Creates a scorer with custom evaluation logic.
 *
 * The evaluate function receives a context with utilities including `execCommand`
 * for running shell commands, making it easy to create both simple command-based
 * scorers and complex custom logic.
 *
 * @example
 * ```typescript
 * // Command-based scorer
 * const buildScorer = createScorer('build', ({ execCommand }) =>
 *   execCommand({
 *     command: 'npm',
 *     args: ['run', 'build'],
 *     timeout: 300000
 *   })
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Custom logic scorer
 * const diffSizeScorer = createScorer('diff-size', async ({ diff }) => {
 *   const lines = diff.split('\n').length;
 *   if (lines < 50) {
 *     return { score: 1.0, reason: 'Changes are concise' };
 *   } else if (lines < 200) {
 *     return { score: 0.5, reason: 'Changes are moderate' };
 *   } else {
 *     return { score: 0.0, reason: 'Changes are too large' };
 *   }
 * });
 * ```
 *
 * @example
 * ```typescript
 * // Hybrid scorer (command + custom logic)
 * const buildAndCheckScorer = createScorer('build-and-check', async ({ execCommand, diff }) => {
 *   const buildResult = await execCommand({
 *     command: 'npm',
 *     args: ['run', 'build'],
 *     timeout: 300000
 *   });
 *
 *   if (buildResult.score === 0) return buildResult;
 *
 *   // Additional check: ensure no console.logs were added
 *   if (/^\+.*console\.log/.test(diff)) {
 *     return { score: 0.5, reason: 'Build passed but console.log added' };
 *   }
 *
 *   return { score: 1.0, reason: 'Build passed, no console.logs' };
 * });
 * ```
 */
export function createScorer(
  name: string,
  evaluate: (context: ScorerContext) => Promise<ScorerResult>
): Scorer {
  return {
    name,
    evaluate,
  };
}

/**
 * Builds the execCommand utility function that gets injected into ScorerContext.
 * This is used internally by the runner to provide command execution capabilities.
 *
 * @internal
 */
export function buildExecCommand(workingDir: string) {
  return async (options: ExecCommandOptions): Promise<ScorerResult> => {
    const {
      command,
      args,
      timeout = 120000, // Default 2 minutes
      successMessage,
      failureMessage,
    } = options;

    try {
      await execa(command, args, {
        cwd: workingDir,
        timeout,
      });
      return {
        score: 1.0,
        reason: successMessage || `${command} ${args.join(' ')} passed`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        score: 0.0,
        reason: failureMessage
          ? `${failureMessage}: ${errorMessage}`
          : `${command} ${args.join(' ')} failed: ${errorMessage}`,
      };
    }
  };
}

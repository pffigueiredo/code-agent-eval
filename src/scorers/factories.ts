import { execa } from 'execa';
import type { ScorerResult, ExecCommandOptions } from '../types';

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

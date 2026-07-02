import type { Scorer, ScorerContext } from '../types';
import { BuildSuccessScorer, TestSuccessScorer, LintSuccessScorer } from './code';
import type { ScorerSpec } from './schema';

export function compileScorer(spec: ScorerSpec): Scorer {
  switch (spec.type) {
    case 'build':
      return new BuildSuccessScorer();
    case 'test':
      return new TestSuccessScorer();
    case 'lint':
      return new LintSuccessScorer();
    case 'command':
      return {
        name: spec.name,
        evaluate: (ctx: ScorerContext) =>
          ctx.execCommand({
            command: spec.command,
            args: spec.args ?? [],
            timeout: spec.timeout,
            successMessage: spec.successMessage,
            failureMessage: spec.failureMessage,
          }),
      };
    default: {
      const _exhaustive: never = spec;
      throw new Error(`Unknown scorer type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function compileScorers(specs: ScorerSpec[]): Scorer[] {
  return specs.map(compileScorer);
}

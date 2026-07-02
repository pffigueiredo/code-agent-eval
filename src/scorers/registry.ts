import type { Scorer, ScorerContext } from '../types';
import { BuildSuccessScorer, TestSuccessScorer, LintSuccessScorer } from './code';
import { SkillPickedUpScorer } from './agent';
import { FileScorer } from './file';
import { DiffContainsScorer } from './diff';
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
    case 'skill-picked-up':
      return new SkillPickedUpScorer(spec.skill);
    case 'file':
      return new FileScorer(spec);
    case 'diff-contains':
      return new DiffContainsScorer(spec);
    case 'all':
    case 'any': {
      const children = spec.of.map(compileScorer);
      const combine = spec.type === 'all' ? Math.min : Math.max;
      return {
        name: spec.name ?? `${spec.type}:[${children.map((c) => c.name).join(',')}]`,
        async evaluate(ctx) {
          const results = await Promise.all(children.map((c) => c.evaluate(ctx)));
          const score = combine(...results.map((r) => r.score));
          return { score, reason: `${spec.type}: ${results.map((r) => `${r.score}`).join(', ')}` };
        },
      };
    }
    default: {
      const _exhaustive: never = spec;
      throw new Error(`Unknown scorer type: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

export function compileScorers(specs: ScorerSpec[]): Scorer[] {
  return specs.map(compileScorer);
}

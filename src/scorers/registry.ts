import type { Scorer, ScorerContext, ScorerResult } from '../types';
import { BuildSuccessScorer, TestSuccessScorer, LintSuccessScorer } from './code';
import { SkillPickedUpScorer } from './agent';
import { FileScorer } from './file';
import { DiffContainsScorer } from './diff';
import { clampScore } from './factories';
import { resolveLibraryEntry } from '../eval-config-loader';
import type { ScorerSpec, ScriptScorerSpec } from './schema';

async function importScriptDefault(scriptPath: string): Promise<unknown> {
  const { createJiti } = await import('jiti');
  const jiti = createJiti(import.meta.url, { alias: { 'code-agent-eval': resolveLibraryEntry() } });
  const mod = (await jiti.import(scriptPath)) as { default?: unknown };
  return mod.default;
}

/** Throws with a SCORER_INVALID-shaped message if the script can't provide a callable default. */
export async function validateScriptScorer(spec: ScriptScorerSpec): Promise<void> {
  let def: unknown;
  try {
    def = await importScriptDefault(spec.path);
  } catch (err) {
    throw new Error(`script scorer "${spec.name}" (${spec.path}): import failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (typeof def !== 'function') {
    throw new Error(`script scorer "${spec.name}" (${spec.path}): default export is not a function`);
  }
}

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
    case 'script':
      return {
        name: spec.name,
        async evaluate(ctx) {
          const def = await importScriptDefault(spec.path);
          if (typeof def !== 'function') throw new Error(`script scorer "${spec.name}": default export is not a function`);
          const result = await (def as (c: typeof ctx) => Promise<ScorerResult>)(ctx);
          return { ...result, score: clampScore(result.score) };
        },
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

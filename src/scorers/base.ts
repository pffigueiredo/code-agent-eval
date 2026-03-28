import type { Scorer, ScorerContext, ScorerResult } from '../types';

/**
 * Abstract base class for all scorers. Extend this to create custom scorers.
 *
 * @example
 * ```typescript
 * import { BaseScorer } from 'code-agent-eval';
 * import type { ScorerContext, ScorerResult } from 'code-agent-eval';
 *
 * class MyScorer extends BaseScorer {
 *   readonly name = 'my-scorer';
 *   async evaluate(context: ScorerContext): Promise<ScorerResult> {
 *     return { score: 1.0, reason: 'ok' };
 *   }
 * }
 * ```
 */
export abstract class BaseScorer implements Scorer {
  abstract readonly name: string;
  abstract evaluate(context: ScorerContext): Promise<ScorerResult>;
}

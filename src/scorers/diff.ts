import type { ScorerContext, ScorerResult } from '../types';
import { BaseScorer } from './base';
import type { DiffScorerSpec } from './schema';

/** Scorer that regex-matches `ctx.diff`; passes when the pattern is present/absent per `expect`. */
export class DiffContainsScorer extends BaseScorer {
  readonly name: string;

  constructor(private readonly spec: DiffScorerSpec) {
    super();
    this.name = spec.name ?? `diff:${spec.pattern}`;
  }

  async evaluate({ diff }: ScorerContext): Promise<ScorerResult> {
    const { spec } = this;
    const present = new RegExp(spec.pattern, spec.flags).test(diff);
    const expectation = spec.expect ?? 'present';
    const ok = expectation === 'present' ? present : !present;
    return ok
      ? { score: 1, reason: `pattern ${expectation} in diff` }
      : { score: 0, reason: `pattern "${spec.pattern}" ${present ? 'found' : 'not found'} in diff (expected ${expectation})` };
  }
}

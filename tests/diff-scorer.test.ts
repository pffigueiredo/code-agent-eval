import { describe, it, expect } from 'vitest';
import { DiffContainsScorer } from '../src/scorers/diff';
import type { ScorerContext } from '../src/types';

function ctx(diff: string): ScorerContext {
  return {
    workingDir: '/tmp',
    diff,
    agentOutput: '[]',
    promptId: 't',
    execCommand: async () => ({ score: 1, reason: 'ok' }),
  };
}

const SAMPLE_DIFF = `--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1,3 +1,4 @@\n+import { foo } from './foo';\n export default function main() {}`;

describe('DiffContainsScorer', () => {
  it('auto-derives name from pattern', () => {
    const s = new DiffContainsScorer({ type: 'diff-contains', pattern: 'foo' });
    expect(s.name).toBe('diff:foo');
  });

  it('uses explicit name when provided', () => {
    const s = new DiffContainsScorer({ type: 'diff-contains', name: 'my-diff', pattern: 'foo' });
    expect(s.name).toBe('my-diff');
  });

  it('passes when pattern present and expect=present (default)', async () => {
    const s = new DiffContainsScorer({ type: 'diff-contains', pattern: 'import.*foo' });
    const r = await s.evaluate(ctx(SAMPLE_DIFF));
    expect(r.score).toBe(1);
  });

  it('fails when pattern absent and expect=present', async () => {
    const s = new DiffContainsScorer({ type: 'diff-contains', pattern: 'nope' });
    const r = await s.evaluate(ctx(SAMPLE_DIFF));
    expect(r.score).toBe(0);
    expect(r.reason).toContain('not found');
  });

  it('passes when pattern absent and expect=absent', async () => {
    const s = new DiffContainsScorer({ type: 'diff-contains', pattern: 'nope', expect: 'absent' });
    const r = await s.evaluate(ctx(SAMPLE_DIFF));
    expect(r.score).toBe(1);
  });

  it('fails when pattern present and expect=absent', async () => {
    const s = new DiffContainsScorer({ type: 'diff-contains', pattern: 'import.*foo', expect: 'absent' });
    const r = await s.evaluate(ctx(SAMPLE_DIFF));
    expect(r.score).toBe(0);
    expect(r.reason).toContain('found');
  });

  it('respects flags (case-insensitive)', async () => {
    const s = new DiffContainsScorer({ type: 'diff-contains', pattern: 'IMPORT', flags: 'i' });
    const r = await s.evaluate(ctx(SAMPLE_DIFF));
    expect(r.score).toBe(1);
  });

  it('passes on empty diff when expect=absent', async () => {
    const s = new DiffContainsScorer({ type: 'diff-contains', pattern: 'anything', expect: 'absent' });
    const r = await s.evaluate(ctx(''));
    expect(r.score).toBe(1);
  });

  it('scores 0 on invalid regex instead of throwing', async () => {
    const s = new DiffContainsScorer({ type: 'diff-contains', pattern: '(', expect: 'present' });
    const r = await s.evaluate(ctx('x'));
    expect(r.score).toBe(0);
    expect(r.reason).toMatch(/invalid regex/i);
  });
});

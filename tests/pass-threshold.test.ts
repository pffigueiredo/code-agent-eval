import { expect, test, describe } from 'vitest';
import { isScorePassing } from '../src/runner';
import type { ScorerResult } from '../src/types';

const result = (partial: Partial<ScorerResult>): ScorerResult => ({
  score: 0,
  reason: '',
  ...partial,
});

describe('isScorePassing', () => {
  describe('default threshold (1.0) — binary behavior unchanged', () => {
    test('score 1.0 passes', () => {
      expect(isScorePassing(result({ score: 1.0 }))).toBe(true);
    });

    test('score 0.75 fails', () => {
      expect(isScorePassing(result({ score: 0.75 }))).toBe(false);
    });

    test('score 0 fails', () => {
      expect(isScorePassing(result({ score: 0 }))).toBe(false);
    });
  });

  describe('custom passThreshold', () => {
    test('passThreshold 0.6 → score 0.75 passes', () => {
      expect(isScorePassing(result({ score: 0.75, passThreshold: 0.6 }))).toBe(true);
    });

    test('passThreshold 0.6 → score 0.6 passes (>= boundary)', () => {
      expect(isScorePassing(result({ score: 0.6, passThreshold: 0.6 }))).toBe(true);
    });

    test('passThreshold 0.6 → score 0.5 fails', () => {
      expect(isScorePassing(result({ score: 0.5, passThreshold: 0.6 }))).toBe(false);
    });
  });
});

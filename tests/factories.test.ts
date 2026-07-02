import { describe, it, expect } from 'vitest';
import { tryParseScore, clampScore } from '../src/scorers/factories';

describe('clampScore', () => {
  it('clamps into [0,1]', () => {
    expect(clampScore(5)).toBe(1);
    expect(clampScore(-2)).toBe(0);
    expect(clampScore(0.5)).toBe(0.5);
  });
});

describe('tryParseScore', () => {
  it('clamps an out-of-range stdout score up to 1', () => {
    expect(tryParseScore('{"score":5,"reason":"x"}')).toMatchObject({ score: 1 });
  });

  it('clamps a negative stdout score to 0', () => {
    expect(tryParseScore('{"score":-2,"reason":"x"}')).toMatchObject({ score: 0 });
  });

  it('passes through an in-range fractional score', () => {
    expect(tryParseScore('{"score":0.5,"reason":"partial"}')).toMatchObject({ score: 0.5, reason: 'partial' });
  });

  it('returns null for non-JSON stdout', () => {
    expect(tryParseScore('plain text')).toBeNull();
  });
});

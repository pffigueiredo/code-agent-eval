// Types
export type {
  EvalResult,
  Scorer,
  ScorerContext,
  ScorerResult,
  TokenUsage,
} from './types';

// Core runner
export { runClaudeCodeEval, type EvalConfig } from './runner';

// Built-in scorers
import * as codeScorers from './scorers/code';
export const scorers = {
  buildSuccess: codeScorers.buildSuccess,
  testSuccess: codeScorers.testSuccess,
  lintSuccess: codeScorers.lintSuccess,
};

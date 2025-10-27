// Core runner
export { runClaudeCodeEval, type EvalConfig } from './runner';

// User-facing types
export type {
  EvalResult,
  IterationResult,
  AggregateScore,
  Scorer,
  ScorerContext,
  ScorerResult,
  ExecutionConfig,
  ExecutionMode,
  ExecCommandOptions,
  EnvGeneratorContext,
  TokenUsage,
} from './types';

// Built-in scorers and factory
import * as codeScorers from './scorers/code';
import { createScorer } from './scorers/factories';
export const scorers = {
  // Pre-built scorers
  buildSuccess: codeScorers.buildSuccess,
  testSuccess: codeScorers.testSuccess,
  lintSuccess: codeScorers.lintSuccess,
  // Factory function
  createScorer,
};

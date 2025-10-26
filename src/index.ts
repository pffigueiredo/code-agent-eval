// Types
export type {
  EvalResult,
  Scorer,
  ScorerContext,
  ScorerResult,
  TokenUsage,
  EnvGeneratorContext,
  IterationResult,
  AggregateScore,
} from './types';

// Core runner
export { runClaudeCodeEval, type EvalConfig } from './runner';

// Environment variable generation
export { generateEnvironmentVariables, validateEnvironmentVariables } from './env-generator';

// Built-in scorers
import * as codeScorers from './scorers/code';
export const scorers = {
  buildSuccess: codeScorers.buildSuccess,
  testSuccess: codeScorers.testSuccess,
  lintSuccess: codeScorers.lintSuccess,
};

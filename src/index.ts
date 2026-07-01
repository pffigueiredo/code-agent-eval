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
  TempDirCleanup,
} from './types';

// Base scorer class and built-in scorers
export { BaseScorer } from './scorers/base';
export { BuildSuccessScorer, TestSuccessScorer, LintSuccessScorer } from './scorers/code';
export { SkillPickedUpScorer } from './scorers/agent';

// Environment variable utilities
export { generateEnvironmentVariables, validateEnvironmentVariables } from './env-generator';

// Package manager utilities
export { detectPackageManager, getInstallCommand, type PackageManager } from './package-manager';

// Results writer utilities
export { writeResults, formatResultsAsMarkdown, writeResultsAsJson } from './results-writer';

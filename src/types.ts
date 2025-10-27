export type ExecutionMode = 'sequential' | 'parallel' | 'parallel-limit';

export interface ExecutionConfig {
  mode: ExecutionMode;
  concurrency?: number; // Required when mode = 'parallel-limit'
}

export interface Scorer {
  name: string;
  evaluate: (context: ScorerContext) => Promise<ScorerResult>;
}

/**
 * Options for executing a command in a scorer
 */
export interface ExecCommandOptions {
  /** Command to execute (e.g., 'npm', 'pnpm', 'bun') */
  command: string;
  /** Arguments to pass to the command (e.g., ['run', 'build']) */
  args: string[];
  /** Timeout in milliseconds (default: 120000 = 2 minutes) */
  timeout?: number;
  /** Custom success message (default: "{command} passed") */
  successMessage?: string;
  /** Custom failure message prefix (default: "{command} failed") */
  failureMessage?: string;
}

export interface ScorerContext {
  workingDir: string; // Temp directory where changes were made
  diff: string; // Git diff output
  agentOutput: string; // Raw agent response
  environmentVariables?: Record<string, string>; // Env vars used in this iteration
  /** Utility function to execute shell commands and return scored results */
  execCommand: (options: ExecCommandOptions) => Promise<ScorerResult>;
}

export interface ScorerResult {
  score: number; // 0.0 to 1.0
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface EnvGeneratorContext {
  iteration: number; // 0-based iteration index
  evalName: string; // Name of the eval
  totalIterations?: number; // Total number of iterations
}

export interface IterationResult {
  iterationId: number;
  success: boolean;
  duration: number;
  scores: Record<string, ScorerResult>;
  diff: string;
  tokenUsage?: TokenUsage;
  workingDir?: string;
  environmentVariables: Record<string, string>;
  error?: string;
}

export interface AggregateScore {
  mean: number;
  min: number;
  max: number;
  stdDev: number;
  passRate: number;
}

export interface EvalResult {
  evalName: string;
  timestamp: string;
  success: boolean;
  duration: number; // milliseconds
  iterations: IterationResult[];
  aggregateScores: Record<string, AggregateScore>;
  tokenUsage?: TokenUsage; // Token usage from Claude API
  workingDir?: string; // Only set if keepTempDir=true
  error?: string;
}

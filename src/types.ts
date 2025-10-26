export interface Scorer {
  name: string;
  fn: (context: ScorerContext) => Promise<ScorerResult>;
}

export interface ScorerContext {
  workingDir: string; // Temp directory where changes were made
  diff: string; // Git diff output
  agentOutput: string; // Raw agent response
  environmentVariables?: Record<string, string>; // Env vars used in this iteration
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

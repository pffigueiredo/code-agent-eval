export interface Scorer {
  name: string;
  fn: (context: ScorerContext) => Promise<ScorerResult>;
}

export interface ScorerContext {
  workingDir: string; // Temp directory where changes were made
  diff: string; // Git diff output
  agentOutput: string; // Raw agent response
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

export interface EvalResult {
  evalName: string;
  timestamp: string;
  success: boolean;
  duration: number; // milliseconds
  scores: Record<string, ScorerResult>;
  diff: string;
  tokenUsage?: TokenUsage; // Token usage from Claude API
  workingDir?: string; // Only set if keepTempDir=true
  error?: string;
}

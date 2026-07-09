export type ExecutionMode = "sequential" | "parallel" | "parallel-limit";

export interface ExecutionConfig {
	mode: ExecutionMode;
	concurrency?: number; // Required when mode = 'parallel-limit'
}

/**
 * Controls when temporary directories should be cleaned up after evaluation
 * - 'always': Delete temp directories after every iteration (default)
 * - 'on-failure': Keep temp directories only when iterations fail
 * - 'never': Keep all temp directories for inspection
 */
export type TempDirCleanup = "always" | "on-failure" | "never";

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
	promptId: string; // Which prompt variant is being evaluated
	prompt: string; // The prompt text given to the agent
	environmentVariables?: Record<string, string>; // Env vars used in this iteration
	/** Utility function to execute shell commands and return scored results */
	execCommand: (options: ExecCommandOptions) => Promise<ScorerResult>;
}

export interface ScorerResult {
	score: number; // 0.0 to 1.0
	reason: string;
	metadata?: Record<string, unknown>;
	passThreshold?: number; // default 1.0; pass when score >= passThreshold
}

/**
 * A single rubric option for an LLM classifier — self-describing.
 * The judge emits exactly one `label`; that choice maps deterministically to `score`.
 */
export interface Choice {
	label: string; // 'A' — the token the judge must emit
	description: string; // what this verdict means, shown to the judge and echoed into the result
	score: number; // 0..1 mapped when this label is chosen
}

/**
 * Declarative spec for an LLM-as-judge classifier. Data, not code:
 * the judge prompt is generated from `instructions` + `choices`.
 *
 * `instructions` is the QUESTION only and may reference the context vars
 * `{{prompt}}`, `{{diff}}`, `{{finalText}}`, `{{agentOutput}}` (and the
 * reserved-but-unpopulated `{{expected}}`).
 */
export interface ClassifierSpec {
	name: string; // -> scorer name, e.g. 'llm:instruction-following'
	instructions: string; // the QUESTION only
	choices: Choice[]; // the rubric options; the judge picks exactly one label
	useCoT?: boolean; // default true
	passThreshold?: number; // default 1.0
	model?: string; // default: SDK default
}

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	cacheCreationInputTokens?: number;
	cacheReadInputTokens?: number;
}

export interface EnvGeneratorContext {
	iteration: number; // 0-based iteration index
	promptId: string; // Which prompt variant is being run
	evalName: string; // Name of the eval
	totalIterations?: number; // Total number of iterations
}

export interface IterationResult {
	iterationId: number;
	promptId: string; // Which prompt variant was used
	success: boolean;
	duration: number;
	scores: Record<string, ScorerResult>;
	agentOutput: string; // Full agent conversation/messages
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
	agentId: string; // Identifier for the agent/model used (e.g., 'claude-code', 'claude-sonnet-4')
	timestamp: string;
	success: boolean;
	duration: number; // milliseconds
	iterations: IterationResult[];
	aggregateScores: Record<string, AggregateScore>;
	tokenUsage?: TokenUsage; // Token usage from Claude API
	workingDir?: string; // Only set if temp dir is preserved (see tempDirCleanup config)
	error?: string;
}

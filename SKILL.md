---
name: code-agent-eval
description: >
  Generate eval config files for the `code-agent-eval` library, which runs prompts against coding agents
  (Claude Code, Cursor, etc.), captures diffs, and scores results with deterministic and LLM-based scorers.
  Use this skill whenever the user wants to evaluate, benchmark, or test a coding agent's performance on a
  codebase — including creating eval configs, writing scorers, comparing prompt variants, or running evals
  via CLI or programmatic API. Also trigger when the user mentions "eval", "agent evaluation", "prompt
  comparison", "coding agent testing", "agent benchmark", or wants to measure how well an AI coding
  assistant handles a task.
---

# code-agent-eval

Generate eval config files for `code-agent-eval` — a TypeScript library that runs prompts against coding
agents in isolated temp directories, captures git diffs, and scores results.

## How to help the user

1. **Understand what they want to evaluate** — which codebase, what task, how many iterations, what
   constitutes success.
2. **Generate the eval config** — export a default object (no imports needed for basic configs).
3. **Write appropriate scorers** — command-based, custom logic, or hybrid.
4. **Suggest how to run it** — CLI for one-off runs, programmatic API for integration.

## Quick start

Create an eval config file (`.ts` or `.js`) and run:

```bash
npx code-agent-eval --eval-file ./eval.config.ts
```

## Eval config format

Export a default object — no imports needed:

```typescript
export default {
  name: 'my-eval',
  prompts: [
    { id: 'v1', prompt: 'Add a /health endpoint that returns { status: "ok" }' },
  ],
  projectDir: '.',
  iterations: 3,
  scorers: [
    {
      name: 'build',
      evaluate: async ({ execCommand }) =>
        execCommand({ command: 'npm', args: ['run', 'build'], timeout: 60000 }),
    },
    {
      name: 'test',
      evaluate: async ({ execCommand }) =>
        execCommand({ command: 'npm', args: ['test'], timeout: 120000 }),
    },
  ],
  resultsDir: './eval-results',
}
```

## EvalConfig type

```typescript
{
  name: string;                         // Eval name
  prompts: Array<{
    id: string;                         // Unique prompt identifier
    prompt: string;                     // Prompt text sent to agent
  }>;
  projectDir: string;                   // Source project path (copied to temp dir)
  iterations?: number;                  // Runs per prompt (default: 1)
  execution?: {
    mode: 'sequential' | 'parallel' | 'parallel-limit';
    concurrency?: number;               // Required for parallel-limit
  };
  timeout?: number;                     // Per-iteration timeout ms (default: 600000)
  scorers?: Scorer[];                   // Scoring functions (default: [])
  verbose?: boolean;                    // Show SDK logs (default: false)
  tempDirCleanup?: 'always' | 'on-failure' | 'never';  // default: 'always'
  resultsDir?: string;                  // Auto-export results dir (markdown + JSON + logs)
  installDependencies?: boolean;        // default: true — auto-detects npm/yarn/pnpm/bun
  agentId?: string;                     // default: 'claude-code' — identifies agent in results
  claudeCodeOptions?: {                 // Passed to Claude Agent SDK query()
    systemPrompt?: string;              // Appended to base system prompt
    [key: string]: unknown;             // Any other SDK options
  };
  environmentVariables?:
    | Record<string, string>
    | ((ctx: { iteration: number; promptId: string; evalName: string }) =>
        Record<string, string> | Promise<Record<string, string>>);
}
```

## Scorer interface

```typescript
interface Scorer {
  name: string;
  evaluate: (context: ScorerContext) => Promise<ScorerResult>;
}

interface ScorerContext {
  workingDir: string;                    // Temp directory with agent's changes
  diff: string;                          // Git diff output
  agentOutput: string;                   // Raw agent messages (JSON)
  promptId: string;                      // Which prompt variant
  environmentVariables?: Record<string, string>;
  execCommand: (opts: ExecCommandOptions) => Promise<ScorerResult>;
}

interface ExecCommandOptions {
  command: string;                       // e.g. 'npm', 'pnpm'
  args: string[];                        // e.g. ['run', 'build']
  timeout?: number;                      // ms (default: 120000)
  successMessage?: string;
  failureMessage?: string;
}

interface ScorerResult {
  score: number;                         // 0.0 to 1.0
  reason: string;
  metadata?: Record<string, unknown>;
}
```

## Scorer patterns

**Command-based** — run a shell command, pass/fail:
```typescript
{
  name: 'typecheck',
  evaluate: async ({ execCommand }) =>
    execCommand({ command: 'pnpm', args: ['typecheck'], timeout: 60000 }),
}
```

**Custom logic** — inspect the diff or agent output:
```typescript
{
  name: 'diff-size',
  evaluate: async ({ diff }) => {
    const lines = diff.split('\n').length;
    return lines < 50
      ? { score: 1.0, reason: `Concise (${lines} lines)` }
      : { score: 0.0, reason: `Too large (${lines} lines)` };
  },
}
```

**Hybrid** — combine command execution with custom checks:
```typescript
{
  name: 'build-clean',
  evaluate: async ({ execCommand, diff }) => {
    const build = await execCommand({ command: 'npm', args: ['run', 'build'], timeout: 300000 });
    if (build.score === 0) return build;
    if (/^\+.*console\.log/m.test(diff)) {
      return { score: 0.5, reason: 'Build OK but console.log added' };
    }
    return { score: 1.0, reason: 'Build passed, clean diff' };
  },
}
```

## Built-in scorers

The library ships pre-built scorers accessible via the programmatic API:

```typescript
import { scorers } from 'code-agent-eval';

export default {
  name: 'my-eval',
  prompts: [{ id: 'v1', prompt: 'Refactor the auth module' }],
  projectDir: '.',
  scorers: [
    scorers.buildSuccess(),          // npm run build (5min timeout)
    scorers.testSuccess(),           // npm run test  (5min timeout)
    scorers.lintSuccess(),           // npm run lint  (1min timeout)
    scorers.skillPickedUp('commit'), // check if 'commit' skill was invoked
  ],
}
```

`scorers.createScorer(name, evaluateFn)` is also available for creating custom scorers with the factory pattern.

## CLI options

```
code-agent-eval --eval-file <path> [options]

Options:
  --eval-file <path>     Required. Path to eval config (.ts/.js)
  --iterations <n>       Override config iterations
  --verbose              Force verbose logging
  --results-dir <path>   Override results directory
  --json                 Output results as JSON to stdout (logs go to stderr)
  --dry-run              Validate config and show execution plan without running
  --help                 Show help
  --version              Show version

Environment variable overrides (flags take precedence):
  CODE_AGENT_EVAL_ITERATIONS    Override iteration count
  CODE_AGENT_EVAL_VERBOSE       Set to "1" or "true" for verbose
  CODE_AGENT_EVAL_RESULTS_DIR   Override results directory
```

**Precedence:** CLI flags > environment variables > config file values.

## Programmatic API

For integration into test suites or CI pipelines:

```typescript
import { runClaudeCodeEval } from 'code-agent-eval';

const result = await runClaudeCodeEval({
  name: 'ci-eval',
  prompts: [{ id: 'v1', prompt: 'Fix the failing test in auth.test.ts' }],
  projectDir: './my-project',
  iterations: 3,
  scorers: [
    {
      name: 'test',
      evaluate: async ({ execCommand }) =>
        execCommand({ command: 'npm', args: ['test'], timeout: 120000 }),
    },
  ],
});

console.log(result.success);           // boolean — all iterations passed
console.log(result.aggregateScores);   // per-scorer stats (mean, min, max, stdDev, passRate)
console.log(result.tokenUsage);        // total token consumption
```

## Multi-prompt comparison

Compare how different prompt phrasings perform on the same task:

```typescript
export default {
  name: 'prompt-comparison',
  prompts: [
    { id: 'minimal', prompt: 'Add auth middleware' },
    { id: 'detailed', prompt: 'Add JWT auth middleware with refresh tokens, rate limiting, and role-based access' },
    { id: 'step-by-step', prompt: 'Step 1: Add JWT verification. Step 2: Add refresh tokens. Step 3: Add RBAC.' },
  ],
  projectDir: './my-api',
  iterations: 5,
  execution: { mode: 'parallel-limit', concurrency: 3 },
  scorers: [
    {
      name: 'test',
      evaluate: async ({ execCommand }) =>
        execCommand({ command: 'npm', args: ['test'], timeout: 120000 }),
    },
  ],
  resultsDir: './eval-results',
}
```

## Environment variables

Static or dynamic per iteration:

```typescript
export default {
  name: 'with-env',
  prompts: [{ id: 'v1', prompt: 'Connect to database and add migration' }],
  projectDir: '.',
  // Static:
  environmentVariables: {
    DATABASE_URL: 'postgres://localhost:5432/test',
    NODE_ENV: 'test',
  },
  // Or dynamic (receives iteration context):
  // environmentVariables: ({ iteration, promptId }) => ({
  //   DATABASE_URL: `postgres://localhost:5432/test_${iteration}`,
  // }),
}
```

## Key behaviors

- Original `projectDir` is never modified — all work happens in isolated `/tmp/eval-{uuid}` directories
- Dependencies auto-installed (npm/yarn/pnpm/bun detected from lock files) unless `installDependencies: false`
- Git repo initialized automatically if not already present
- Agent runs with `permissionMode: 'bypassPermissions'` in a sandboxed system prompt
- `--json` mode sends structured results to stdout, all logs to stderr — safe for piping
- `--dry-run` validates config and prints the execution plan without running anything
- Results written to `resultsDir/` if specified: `results.md`, `results.json`, and `iteration-*.log` files
- Exit code: 0 if all iterations pass, 1 if any fail

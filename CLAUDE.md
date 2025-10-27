# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`cc-eval` (Claude Code Eval Library) is a TypeScript library for testing AI integration prompts against real codebases using Claude Code Agent SDK. The library enables developers to validate prompt reliability by running them multiple times, capturing code changes, and scoring outputs using both deterministic (build/test/lint) and LLM-based evaluation patterns.

**Key Principle**: Original codebases remain UNTOUCHED. All Claude Code modifications happen in isolated temporary directories that are created per-iteration and cleaned up afterwards.

## Development Commands

### Build & Test
```bash
# Install dependencies (first time)
npm install  # or bun install

# Build the library
npm run build

# Watch mode (rebuild on changes)
npm run dev

# Run tests
npm run test

# Type checking
npm run typecheck
```

### Running Examples
```bash
# Run Phase 1 example (single evaluation)
npx tsx examples/phase1-single-run.ts

# Run Phase 2 example (multi-iteration with env vars)
npx tsx examples/phase2-multi-iteration.ts

# Run parallel execution example
npx tsx examples/parallel-execution.ts

# Run results export example
npx tsx examples/results-export.ts

# To preserve temp directories for inspection, set keepTempDir: true in the config
```

## Architecture

### Core Workflow
1. **Copy**: User's project is copied to isolated temp directory (OS-specific temp dir + `eval-{uuid}`)
2. **Install**: Dependencies are automatically installed using detected package manager (npm/yarn/pnpm/bun)
3. **Execute**: Claude Code Agent SDK runs against the temp directory with user's prompt
4. **Capture**: Git diff captures all changes made by the agent
5. **Score**: Deterministic and LLM-based scorers evaluate the results
6. **Cleanup**: Temp directory is deleted (unless `keepTempDir: true` is set)

### Key Components

**Core Runner** (`src/runner.ts`):
- `runClaudeCodeEval(config)`: Main entry point that orchestrates the entire eval flow
  - Takes single `EvalConfig` object with all parameters
  - `iterations` field specifies how many times to run (default: 1)
  - `execution` field controls sequential/parallel mode (default: sequential)
  - Supports three execution modes:
    - `sequential`: One at a time (default)
    - `parallel`: All iterations concurrently
    - `parallel-limit`: Controlled concurrency (requires `concurrency` parameter)
  - Each iteration runs in its own isolated temp directory
  - Aggregates results across all iterations with statistics
  - Displays list of all preserved temp directories when `keepTempDir: true` is set
- `runSingleIteration()`: Internal function that handles one iteration
  - Manages temp directory lifecycle (copy, setup git, install dependencies, cleanup)
  - Automatically detects and uses correct package manager (npm/yarn/pnpm/bun)
  - Installs dependencies before running agent (can be disabled with `installDependencies: false`)
  - Integrates with Claude Code Agent SDK using the `query()` function from `@anthropic-ai/claude-agent-sdk`
  - Collects output from the async generator pattern returned by `query()`
  - Executes scorers for that iteration
  - Tracks token usage from Claude API
- `calculateAggregateScores()`: Computes statistics (mean, min, max, stdDev, passRate) across iterations
- **Logging**: By default, shows user-friendly output (tool uses, completions). Set `verbose: true` in `EvalConfig` to see full SDK message JSON dumps

**Type System** (`src/types.ts`):
- `ExecutionMode`: Type for execution modes (`'sequential' | 'parallel' | 'parallel-limit'`)
- `ExecutionConfig`: Configuration for execution control
  - `mode: ExecutionMode`: Which execution strategy to use
  - `concurrency?: number`: Required when mode is 'parallel-limit'
- `EvalConfig`: Configuration for running evaluations (name, prompt, projectDir, iterations, execution, timeout, scorers, verbose, keepTempDir, resultsDir, installDependencies)
  - `iterations?: number`: How many times to run the eval (default: 1)
  - `execution?: ExecutionConfig`: Execution strategy (default: { mode: 'sequential' })
  - `verbose?: boolean`: Optional flag to enable detailed SDK logging (default: false)
  - `keepTempDir?: boolean`: Optional flag to preserve temp directory after eval (default: false)
  - `resultsDir?: string`: Optional directory path to write markdown results file
  - `installDependencies?: boolean`: Optional flag to skip dependency installation (default: true)
  - `environmentVariables?: Record<string, string> | (context) => Record<string, string> | Promise<...>`: Optional env vars (static or dynamic)
- `EvalResult`: Results from all iterations (evalName, timestamp, iterations, aggregateScores, tokenUsage)
- `IterationResult`: Results from a single iteration (iterationId, success, duration, scores, diff, agentOutput, environmentVariables, tokenUsage)
- `AggregateScore`: Statistics for a scorer across iterations (mean, min, max, stdDev, passRate)
- `EnvGeneratorContext`: Context for dynamic env var generation (iteration, evalName, totalIterations)
- `Scorer`: Interface for implementing evaluation scorers (name + evaluate function)
- `ScorerContext`: Context provided to scorers (workingDir, diff, agentOutput, environmentVariables, execCommand)
- `ScorerResult`: Output from scorers (score 0.0-1.0, reason, optional metadata)
- `ExecCommandOptions`: Options for executing shell commands via execCommand utility (command, args, timeout, successMessage, failureMessage)
- `TokenUsage`: Claude API token usage tracking (input, output, total)

**Scorers** (`src/scorers/`):
- `factories.ts`: Single unified factory for creating scorers
  - `createScorer(name, evaluateFn)`: Creates a scorer with custom evaluation logic
    - The `evaluateFn` receives `ScorerContext` which includes `execCommand` utility for running shell commands
    - Supports both simple command execution and complex custom logic
    - Can combine command execution with additional validation
- `code.ts`: Pre-built deterministic scorers that run npm scripts (implemented using `createScorer` + `execCommand`)
  - `buildSuccess()`: Runs `npm run build` and scores 1.0 if passes (5-minute timeout)
  - `testSuccess()`: Runs `npm run test` and scores 1.0 if passes (5-minute timeout)
  - `lintSuccess()`: Runs `npm run lint` and scores 1.0 if passes (1-minute timeout)

**Environment Variable Generator** (`src/env-generator.ts`):
- `generateEnvironmentVariables()`: Generates env vars for each iteration
  - Supports static objects (same vars for all iterations)
  - Supports dynamic functions (different vars per iteration)
  - Supports async generators (e.g., fetching API keys)
- `validateEnvironmentVariables()`: Validates env var names and values
  - Ensures valid variable names (alphanumeric + underscore)
  - Warns when overriding system variables
  - Validates all values are strings

**Package Manager Detection** (`src/package-manager.ts`):
- `detectPackageManager(projectDir)`: Automatically detects package manager from lock files
  - Checks for `bun.lockb` or `bun.lock` → returns 'bun'
  - Checks for `pnpm-lock.yaml` → returns 'pnpm'
  - Checks for `yarn.lock` → returns 'yarn'
  - Checks for `package-lock.json` → returns 'npm'
  - Defaults to 'npm' if no lock file found
- `getInstallCommand(packageManager)`: Returns install command array for a package manager
  - npm → `['npm', 'install']`
  - yarn → `['yarn', 'install']`
  - pnpm → `['pnpm', 'install']`
  - bun → `['bun', 'install']`

**Public API** (`src/index.ts`):
- Exports all types, runner function, and built-in scorers
- Exports environment variable utilities (`generateEnvironmentVariables`, `validateEnvironmentVariables`)
- Exports package manager utilities (`detectPackageManager`, `getInstallCommand`, `PackageManager`)
- Exports scorer factory (`createScorer`) and utility types (`ExecCommandOptions`)
- Exports results writer utilities (`writeResults`, `formatResultsAsMarkdown`)
- Scorers are grouped under `scorers` namespace (includes both pre-built scorers and factory function)

**Results Writer** (`src/results-writer.ts`):
- `writeResults(result, outputDir)`: Writes evaluation results to a structured directory
  - Creates directory: `{outputDir}/{evalName}-{timestamp}/`
  - Writes `results.md` with aggregate results
  - Writes `iteration-N.log` files with full agent output per iteration
  - Returns the path to the created directory
- `formatResultsAsMarkdown(result)`: Formats `EvalResult` as markdown string
  - Includes summary, aggregate scores table, per-iteration results, token usage
  - Can be used to generate custom reports

### Exporting Results

The library automatically exports detailed results to a structured directory:

```typescript
import { runClaudeCodeEval, scorers } from 'cc-eval';

const result = await runClaudeCodeEval({
  name: 'add-feature',
  prompt: 'Add a health check endpoint',
  projectDir: './my-app',
  iterations: 10,
  scorers: [scorers.buildSuccess(), scorers.testSuccess()],
  // Export results to directory
  resultsDir: './eval-results',
});

// Results are written to: eval-results/add-feature-YYYY-MM-DD-HHMMSS/
//   - results.md (aggregate results)
//   - iteration-0.log (full agent output for iteration 0)
//   - iteration-1.log (full agent output for iteration 1)
//   - ... (one log file per iteration)
```

**Directory Structure:**
```
eval-results/
└── add-feature-2025-01-15-143022/
    ├── results.md          # Aggregate results
    ├── iteration-0.log     # Full agent output for iteration 0
    ├── iteration-1.log     # Full agent output for iteration 1
    └── ...                 # One log per iteration
```

**results.md includes:**
- Summary with duration, pass rate, and overall status
- Aggregate scores table (mean, min, max, stdDev, passRate per scorer)
- Per-iteration results table with all scores
- Detailed breakdown with reasons and metadata for each scorer
- Token usage statistics (total and per-iteration)

**iteration-N.log includes:**
- Full agent output (tool uses, reasoning, completions)
- Environment variables used for that iteration
- Scores and reasons for that iteration
- Token usage for that iteration

You can also manually format and write results:

```typescript
import { formatResultsAsMarkdown, writeResults } from 'cc-eval';

// Format aggregate results as markdown string
const markdown = formatResultsAsMarkdown(result);
console.log(markdown);

// Or write to custom location (creates directory structure)
const dirPath = await writeResults(result, './custom-dir');
console.log(`Results written to: ${dirPath}`);
```

### Creating Custom Scorers

The library provides a single `createScorer` factory function. All scorers receive a `ScorerContext` that includes an `execCommand` utility for running shell commands.

**Command-based scorer (using execCommand):**
```typescript
import { createScorer, runClaudeCodeEval } from 'cc-eval';

const config = {
  name: 'my-eval',
  prompt: 'Add types to all functions',
  projectDir: './my-project',
  scorers: [
    // Using pnpm instead of npm
    createScorer('typecheck', ({ execCommand }) =>
      execCommand({
        command: 'pnpm',
        args: ['typecheck'],
        timeout: 60000
      })
    ),
    // Custom build command with messages
    createScorer('build:production', ({ execCommand }) =>
      execCommand({
        command: 'npm',
        args: ['run', 'build:production'],
        timeout: 300000,
        successMessage: 'Production build succeeded',
        failureMessage: 'Production build failed'
      })
    )
  ]
};
```

**Custom logic scorer (no commands):**
```typescript
import { createScorer } from 'cc-eval';

// Scorer that checks diff size
const diffSizeScorer = createScorer('diff-size', async ({ diff }) => {
  const lines = diff.split('\n').length;
  if (lines < 50) {
    return { score: 1.0, reason: 'Changes are concise (< 50 lines)' };
  } else if (lines < 200) {
    return { score: 0.5, reason: 'Changes are moderate (50-200 lines)' };
  } else {
    return { score: 0.0, reason: `Changes are too large (${lines} lines)` };
  }
});

// Scorer that checks for specific patterns
const noConsoleLogScorer = createScorer('no-console-log', async ({ diff }) => {
  const addedConsoleLog = /^\+.*console\.log/.test(diff);
  if (addedConsoleLog) {
    return { score: 0.0, reason: 'Added console.log statements' };
  }
  return { score: 1.0, reason: 'No console.log statements added' };
});
```

**Hybrid scorer (command + custom logic):**
```typescript
import { createScorer } from 'cc-eval';

// Runs build AND checks for console.log statements
const buildAndCheckScorer = createScorer('build-and-check', async ({ execCommand, diff }) => {
  // First, run the build
  const buildResult = await execCommand({
    command: 'npm',
    args: ['run', 'build'],
    timeout: 300000
  });

  // If build failed, return early
  if (buildResult.score === 0) return buildResult;

  // Build passed, now check for console.logs
  if (/^\+.*console\.log/.test(diff)) {
    return { score: 0.5, reason: 'Build passed but console.log added' };
  }

  return { score: 1.0, reason: 'Build passed, no console.logs' };
});
```

### Claude Code Agent SDK Integration

The library uses `@anthropic-ai/claude-agent-sdk` which provides:
- Pre-built agent loop with file system tools
- The `query()` function that returns an async generator
- Automatic handling of tool calls (read/write/edit files)

**Important Pattern**:
```typescript
const result = query({
  prompt: config.prompt,
  options: {
    cwd: tempDir,
    settingSources: ['project'],
    permissionMode: 'bypassPermissions', // Required for unattended eval runs
    ...config.claudeCodeOptions,
  },
});

// Collect all output from the async generator
let agentOutput = '';
for await (const message of result) {
  if (message.type === 'assistant' || message.type === 'result') {
    agentOutput = JSON.stringify(message);
  }
}
```

**Automated Evaluation Mode**:
The library configures the SDK for fully unattended operation:
- **Permission Mode**: `permissionMode: 'bypassPermissions'` auto-approves all file operations and tool uses
- **System Prompt**: A special system prompt instructs Claude to never ask questions or wait for user confirmation
  - Claude makes all decisions independently without requesting approval
  - Prevents the agent from pausing execution to ask clarifying questions
  - Example: Instead of "Would you like me to proceed?", Claude proceeds automatically
- **Safety**: Safe because evals run in isolated temp directories that get deleted after each run
- **Customization**: Users can override both settings via `claudeCodeOptions` if custom behavior is needed

**Why this is necessary**:
- `bypassPermissions` only handles permission prompts (file edits, tool calls)
- Without the system prompt, Claude may still ask general questions like "Should I add these references?"
- The system prompt ensures fully autonomous execution without human intervention

### Temp Directory Isolation

- Each eval run gets a unique temp directory: `{os.tmpdir()}/eval-{uuid}`
  - macOS/Linux: `/tmp/eval-{uuid}` or `/var/folders/.../eval-{uuid}`
  - Windows: `C:\Users\...\AppData\Local\Temp\eval-{uuid}`
- Node modules are skipped during copy (filtered out for performance)
- Dependencies are automatically installed in temp directory after copy
  - Package manager is auto-detected from lock files (npm/yarn/pnpm/bun)
  - Can be disabled with `installDependencies: false` config option
  - 10-minute timeout for large projects
- Git history is preserved or initialized if not present
- Original `projectDir` is NEVER modified
- Cleanup happens automatically unless `keepTempDir: true` is set in config

## Implementation Status

**Phase 1 (COMPLETE)**: Single eval runner with deterministic scorers
- ✅ Core types defined
- ✅ Runner implementation with Claude Code SDK integration
- ✅ Build/test/lint scorers
- ✅ Basic example script
- ✅ Temp directory isolation and cleanup

**Phase 2 (COMPLETE)**: Iterations + scoring system
- ✅ Multiple iterations with aggregated results
- ✅ Pass rate calculation and statistics (mean, min, max, stdDev)
- ✅ Environment variable injection (static and dynamic)
- ✅ Per-iteration and aggregate scoring
- ✅ Token usage tracking
- ✅ Working example with multi-iteration support
- ✅ Parallel execution support (sequential, parallel, parallel-limit modes)
- ✅ Markdown results export to files

**Phase 3 (PENDING)**: Comparison mode
- A/B testing multiple prompts
- Winner selection logic

**Phase 4 (PENDING)**: LLM judges
- Code quality evaluation using LLMs
- Prompt following verification

## Testing Approach

**Unit Tests**:
- `tests/index.test.ts`: Type exports verification and scorer availability checks
- `tests/env-vars.test.ts`: Environment variable generation and validation tests
  - Static env vars
  - Dynamic env var functions
  - Async generators
  - Validation rules
  - Context handling across iterations

**Integration Testing** (Manual):
- Run example scripts to verify end-to-end functionality
- Check temp directory creation/cleanup
- Verify git diff capture
- Ensure scorers execute correctly

## Important Implementation Notes

### Git Diff Capture
The library assumes projects are git repositories. If not:
1. Git is initialized in temp directory
2. Initial commit is created
3. Diff is captured against that initial state

### Error Handling
- Scorers return `score: 0.0` on failure with error message in `reason`
- Eval continues even if individual scorers fail
- Agent SDK errors are caught and reported in `EvalResult.error`

### Package Manager
The library automatically detects the package manager from lock files:
- `bun.lockb` or `bun.lock` → uses bun
- `pnpm-lock.yaml` → uses pnpm
- `yarn.lock` → uses yarn
- `package-lock.json` → uses npm
- Falls back to npm if no lock file found

Dependencies are installed automatically after copying the project to temp directory (can be disabled with `installDependencies: false`).

### Plugin Isolation
**Plugins are allowed during eval runs** but are constrained to the sandbox via system prompt.

When plugins are loaded, they can provide absolute paths (e.g., to skill directories, templates, or documentation) that exist outside the temp directory. If the agent follows these paths naively, it could escape the sandbox and modify files in the original location instead of the isolated test copy.

**Example of the issue:** In one incident, the `add-neon-docs` skill provided its base directory path (`/Users/.../neon-plugin/skills/add-neon-docs`), and the agent modified the original `CLAUDE.md` file instead of the temp copy. The git diff in the temp directory was empty, causing scorer failures.

**Solution:** The library includes explicit sandbox isolation rules in the system prompt that instruct Claude to:
- Use only relative paths for project files
- Never navigate outside the current working directory
- Treat plugin-provided absolute paths as metadata-only (not for writing project files)

This allows plugins to work normally while ensuring all file modifications stay within the isolated temp directory. Users can pass plugins via `claudeCodeOptions.plugins` to test plugin-based workflows.

## Design Decisions

**Why async generator pattern?**
The Claude Code Agent SDK's `query()` function returns an async generator that yields messages as the agent executes. We collect all output to capture the full agent response.

**Why temp directories instead of branches?**
- Simpler cleanup (just delete directory)
- No git state pollution
- Parallel execution support (future)
- Works with non-git projects

**Why single `createScorer` with `execCommand` in context?**
- **Simplicity**: Single factory function, no magic overloads or multiple APIs to learn
- **Consistency**: All scorers use the same `createScorer(name, evaluateFn)` signature
- **Composability**: Mix command execution with custom logic in the same scorer
- **Testability**: `execCommand` can be mocked in tests; scorers are pure functions
- **Discoverability**: Utilities available in context are type-checked and autocompleted
- **Extensibility**: Easy to add more utilities to context in the future
- **Familiar pattern**: Similar to Cypress (`cy.exec()`), Playwright (`page.evaluate()`), and testing frameworks

**Why project-only settings?**
The library uses `settingSources: ['project']` to ensure clean, isolated test environments:
- **Reproducibility**: Tests produce identical results regardless of who runs them
- **No contamination**: Developer's personal MCP servers and global configs don't interfere
- **Fair evaluation**: Only the project's own `.claude` settings (if any) are used
- Users can override via `claudeCodeOptions` in `EvalConfig` if needed

## Environment Variables

- `ANTHROPIC_API_KEY`: Required for Claude Code Agent SDK

## References

- **PRD**: `cc-eval-prd.md` - Full product requirements
- **Implementation Plan**: `docs/implementation-plan.md` - Detailed phased development plan
- **Changelog**: `CHANGELOG.md` - Version history and breaking changes
- **Vercel next-evals-oss**: Inspiration for eval structure
- **Claude Agent SDK docs**: https://docs.claude.com/en/api/agent-sdk/typescript
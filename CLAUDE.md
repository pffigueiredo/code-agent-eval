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

# To preserve temp directories for inspection, set keepTempDir: true in the config
```

## Architecture

### Core Workflow
1. **Copy**: User's project is copied to isolated temp directory (OS-specific temp dir + `eval-{uuid}`)
2. **Execute**: Claude Code Agent SDK runs against the temp directory with user's prompt
3. **Capture**: Git diff captures all changes made by the agent
4. **Score**: Deterministic and LLM-based scorers evaluate the results
5. **Cleanup**: Temp directory is deleted (unless `keepTempDir: true` is set)

### Key Components

**Core Runner** (`src/runner.ts`):
- `runClaudeCodeEval()`: Main entry point that orchestrates the entire eval flow
- Manages temp directory lifecycle (copy, setup git, cleanup)
- Integrates with Claude Code Agent SDK using the `query()` function from `@anthropic-ai/claude-agent-sdk`
- Collects output from the async generator pattern returned by `query()`
- Executes scorers and aggregates results
- **Logging**: By default, shows user-friendly output (tool uses, completions). Set `verbose: true` in `EvalConfig` to see full SDK message JSON dumps

**Type System** (`src/types.ts`):
- `EvalConfig`: Configuration for running evaluations (name, prompt, projectDir, timeout, scorers, verbose, keepTempDir)
  - `verbose?: boolean`: Optional flag to enable detailed SDK logging (default: false)
  - `keepTempDir?: boolean`: Optional flag to preserve temp directory after eval (default: false)
- `EvalResult`: Results from a single evaluation run (success, duration, scores, diff, workingDir)
- `Scorer`: Interface for implementing evaluation scorers (name + async function)
- `ScorerContext`: Context provided to scorers (workingDir, diff, agentOutput)
- `ScorerResult`: Output from scorers (score 0.0-1.0, reason, optional metadata)

**Scorers** (`src/scorers/`):
- `code.ts`: Deterministic scorers that run npm scripts
  - `buildSuccess()`: Runs `npm run build` and scores 1.0 if passes
  - `testSuccess()`: Runs `npm run test` and scores 1.0 if passes
  - `lintSuccess()`: Runs `npm run lint` and scores 1.0 if passes
- All code scorers use 5-minute timeouts for build/test, 1-minute for lint

**Public API** (`src/index.ts`):
- Exports all types, runner function, and built-in scorers
- Scorers are grouped under `scorers` namespace

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

**Permission Mode**:
- The library defaults to `permissionMode: 'bypassPermissions'` to enable unattended eval runs
- This auto-approves all file operations and tool uses without blocking on questions
- Safe because evals run in isolated temp directories that get deleted after each run
- Users can override via `claudeCodeOptions` if custom permission logic is needed

### Temp Directory Isolation

- Each eval run gets a unique temp directory: `{os.tmpdir()}/eval-{uuid}`
  - macOS/Linux: `/tmp/eval-{uuid}` or `/var/folders/.../eval-{uuid}`
  - Windows: `C:\Users\...\AppData\Local\Temp\eval-{uuid}`
- Node modules are skipped during copy (filtered out for performance)
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

**Phase 2 (PENDING)**: Iterations + scoring system
- Multiple iterations with aggregated results
- Pass rate calculation
- JSON export to files

**Phase 3 (PENDING)**: Comparison mode
- A/B testing multiple prompts
- Winner selection logic

**Phase 4 (PENDING)**: LLM judges
- Code quality evaluation using LLMs
- Prompt following verification

## Testing Approach

**Unit Tests** (`tests/index.test.ts`):
- Type exports verification
- Scorer availability checks
- Currently minimal - focused on API surface

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
Currently hardcoded to use `npm`. Future phases will detect lockfiles to support pnpm/yarn/bun.

## Design Decisions

**Why async generator pattern?**
The Claude Code Agent SDK's `query()` function returns an async generator that yields messages as the agent executes. We collect all output to capture the full agent response.

**Why temp directories instead of branches?**
- Simpler cleanup (just delete directory)
- No git state pollution
- Parallel execution support (future)
- Works with non-git projects

**Why separate Scorer interface?**
- Extensibility: Users can write custom scorers
- Composability: Mix deterministic and LLM judges
- Testability: Scorers are pure functions
- Follows Braintrust/industry patterns

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
- **Vercel next-evals-oss**: Inspiration for eval structure
- **Claude Agent SDK docs**: https://docs.claude.com/en/api/agent-sdk/typescript
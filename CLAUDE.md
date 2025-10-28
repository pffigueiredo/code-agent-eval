# CLAUDE.md

In all interactions and commit messages, be extremely concise and sacrifice on grammar for the sake of concision.

## Project Overview

`cc-eval` is a TypeScript library for evaluating Claude Code prompts against real codebases. Run prompts multiple times, capture changes, score outputs using deterministic and LLM-based scorers.

**Core Principle**: Original codebases stay untouched. All modifications happen in isolated temp directories.

## Quick Commands

```bash
npm install          # Install deps
npm run build        # Build library
npm run dev          # Watch mode
npm run test         # Run tests
npm run typecheck    # Type checking

# Run examples
npx tsx examples/phase1-single-run.ts
npx tsx examples/phase2-multi-iteration.ts
npx tsx examples/parallel-execution.ts
npx tsx examples/results-export.ts
npx tsx examples/plugin-execution.ts
```

## Architecture

**Core Workflow**:
1. Copy project → isolated temp dir (`/tmp/eval-{uuid}`)
2. Auto-install deps (npm/yarn/pnpm/bun detected from lock files)
3. Run Claude Code Agent SDK with prompt
4. Capture git diff of changes
5. Score results (deterministic + LLM scorers)
6. Cleanup temp dir (unless `keepTempDir: true`)

**Key Files**:
- `src/runner.ts`: Main entry point (`runClaudeCodeEval()` + `runSingleIteration()`)
- `src/types.ts`: All TypeScript types (`EvalConfig`, `EvalResult`, `Scorer`, etc.)
- `src/scorers/`: Pre-built scorers + factory (`createScorer()`)
- `src/env-generator.ts`: Environment variable injection (static/dynamic/async)
- `src/package-manager.ts`: Auto-detect package manager from lock files
- `src/results-writer.ts`: Export results to markdown files

## Public API (`src/index.ts`)

Exports:
- `runClaudeCodeEval()` - main runner
- `scorers` namespace - includes `createScorer()` factory + pre-built scorers
- All types from `types.ts`
- Utils: `generateEnvironmentVariables`, `validateEnvironmentVariables`, `detectPackageManager`, `getInstallCommand`, `writeResults`, `formatResultsAsMarkdown`

## EvalConfig Options

```typescript
{
  name: string;                        // Eval name
  prompt: string;                      // Prompt for agent
  projectDir: string;                  // Source project path
  iterations?: number;                 // Default: 1
  execution?: ExecutionConfig;         // Default: { mode: 'sequential' }
  timeout?: number;                    // Default: 5 min
  scorers?: Scorer[];                  // Default: []
  verbose?: boolean;                   // Default: false (show SDK logs)
  keepTempDir?: boolean;               // Default: false (preserve temp dirs)
  resultsDir?: string;                 // Optional: export results to dir
  installDependencies?: boolean;       // Default: true
  environmentVariables?: Record<string, string> | (context) => Record<string, string> | Promise<...>;
  claudeCodeOptions?: {...};           // Override SDK options
}
```

**Execution modes**:
- `sequential`: One at a time (default)
- `parallel`: All iterations concurrently
- `parallel-limit`: Controlled concurrency (requires `concurrency` param)

## Creating Scorers

Use single `createScorer()` factory. Scorers receive `ScorerContext` with `execCommand` utility.

**Command-based scorer**:
```typescript
import { createScorer } from 'cc-eval';

const typecheck = createScorer('typecheck', ({ execCommand }) =>
  execCommand({
    command: 'pnpm',
    args: ['typecheck'],
    timeout: 60000
  })
);
```

**Custom logic scorer**:
```typescript
const diffSize = createScorer('diff-size', async ({ diff }) => {
  const lines = diff.split('\n').length;
  return lines < 50
    ? { score: 1.0, reason: 'Concise (< 50 lines)' }
    : { score: 0.0, reason: `Too large (${lines} lines)` };
});
```

**Hybrid scorer** (command + logic):
```typescript
const buildAndCheck = createScorer('build-and-check', async ({ execCommand, diff }) => {
  const buildResult = await execCommand({
    command: 'npm',
    args: ['run', 'build'],
    timeout: 300000
  });
  if (buildResult.score === 0) return buildResult;

  if (/^\+.*console\.log/.test(diff)) {
    return { score: 0.5, reason: 'Build passed but console.log added' };
  }
  return { score: 1.0, reason: 'Build passed, no console.logs' };
});
```

## Results Export

Set `resultsDir` in config to auto-export results:

```typescript
const result = await runClaudeCodeEval({
  name: 'add-feature',
  prompt: 'Add health check endpoint',
  projectDir: './my-app',
  iterations: 10,
  scorers: [scorers.buildSuccess(), scorers.testSuccess()],
  resultsDir: './eval-results', // Creates: eval-results/add-feature-YYYY-MM-DD-HHMMSS/
});
```

**Directory structure**:
```
eval-results/add-feature-2025-01-15-143022/
├── results.md          # Aggregate results
├── iteration-0.log     # Full agent output
├── iteration-1.log
└── ...
```

Manual export:
```typescript
import { formatResultsAsMarkdown, writeResults } from 'cc-eval';

const markdown = formatResultsAsMarkdown(result);
const dirPath = await writeResults(result, './custom-dir');
```

## Claude Code Agent SDK Integration

Uses `@anthropic-ai/claude-agent-sdk`:
- `query()` function returns async generator
- Pre-built agent loop with file tools
- Auto-handles tool calls (read/write/edit)

**Automated eval mode**:
- `permissionMode: 'bypassPermissions'` - auto-approves all file ops
- Special system prompt - instructs Claude to never ask questions, make all decisions independently
- Safe because runs in isolated temp dirs
- Override via `claudeCodeOptions` if needed

## Temp Directory Isolation

- Each run: `{os.tmpdir()}/eval-{uuid}`
- Node modules skipped during copy
- Deps auto-installed after copy (10-min timeout)
- Git initialized if not present
- Original `projectDir` never modified
- Cleanup automatic unless `keepTempDir: true`

## Plugin Sandbox Isolation

Plugins allowed but constrained via system prompt:
- Use only relative paths for project files
- Never navigate outside working directory
- Treat plugin-provided absolute paths as metadata-only (not for writing)
- Ensures all file mods stay in temp dir
- Pass plugins via `claudeCodeOptions.plugins` to test plugin workflows

## Testing

**Unit tests**:
- `tests/index.test.ts` - Type exports + scorer availability
- `tests/env-vars.test.ts` - Env var generation/validation
- `tests/package-manager.test.ts` - Package manager detection

**Integration tests** (manual): Run example scripts

## Implementation Status

- ✅ Phase 1: Single eval runner + deterministic scorers
- ✅ Phase 2: Multi-iteration + aggregated scoring + parallel execution + results export
- ⏳ Phase 3: A/B testing multiple prompts
- ⏳ Phase 4: LLM judges

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for Claude Code Agent SDK

## References

- PRD: `cc-eval-prd.md`
- Changelog: `CHANGELOG.md`
- Claude Agent SDK: https://docs.claude.com/en/api/agent-sdk/typescript

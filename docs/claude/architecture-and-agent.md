# Architecture and agent behavior

Related: docs/claude/config-and-usage.md (config, results export), docs/claude/scorers.md (scorer examples).

## Architecture

**Core Workflow**:
1. Copy project → isolated temp dir (`/tmp/eval-{uuid}`)
2. Auto-install deps (npm/yarn/pnpm/bun detected from lock files)
3. Run coding agent (currently Claude Agent SDK) with prompt
4. Capture git diff of changes
5. Score results (deterministic + LLM scorers)
6. Cleanup temp dir based on `tempDirCleanup` mode

**Key Files**:
- `src/runner.ts`: Main entry point (`runClaudeCodeEval()` + `runSingleIteration()`), `EvalConfig` interface
- `src/types.ts`: Shared types (`EvalResult`, `Scorer`, `ScorerContext`, etc.)
- `src/scorers/`: `BaseScorer` abstract class + built-in scorer classes
- `src/env-generator.ts`: Environment variable injection (static/dynamic/async)
- `src/package-manager.ts`: Auto-detect package manager from lock files
- `src/results-writer.ts`: Export results to markdown files

## Public API (`src/index.ts`)

Exports:
- `runClaudeCodeEval()` - main runner (Claude Code agent)
- `BaseScorer`, `BuildSuccessScorer`, `TestSuccessScorer`, `LintSuccessScorer`, `SkillPickedUpScorer` — class-based scorers
- All types from `types.ts`
- Utils: `generateEnvironmentVariables`, `validateEnvironmentVariables`, `detectPackageManager`, `getInstallCommand`, `writeResults`, `writeResultsAsJson`, `formatResultsAsMarkdown`

## Agent SDK Integration

Currently uses `@anthropic-ai/claude-agent-sdk`:
- `query()` function returns async generator
- Pre-built agent loop with file tools
- Auto-handles tool calls (read/write/edit)

**Automated eval mode**:
- `permissionMode: 'bypassPermissions'` - auto-approves all file ops
- Special system prompt - instructs agent to never ask questions, make all decisions independently
- Safe because runs in isolated temp dirs
- Override via `claudeCodeOptions` if needed (passthrough to Agent SDK `query()`)

## Temp Directory Isolation

- Each run: `{os.tmpdir()}/eval-{uuid}`
- Node modules skipped during copy
- Deps auto-installed after copy (10-min timeout)
- Git initialized if not present
- Original `projectDir` never modified
- Cleanup controlled by `tempDirCleanup`:
  - `'always'` (default): Delete after every iteration
  - `'on-failure'`: Keep only failed iteration directories
  - `'never'`: Keep all directories for inspection

## Fixture-scoped Claude Code inputs

Everything under `projectDir` — including `CLAUDE.md`, `.claude/skills`, `.claude/commands`, hooks, subagents, and `.claude/settings.json` — is copied into the temp working directory (subject to the copy filter). With the runner default `settingSources: ['project']`, the Agent SDK loads **project** filesystem settings from that copy, so evals behave like a normal repo checkout.

Prefer this for reproducibility. User-global `~/.claude` is optional and not assumed; opt in via `claudeCodeOptions.settingSources` when you deliberately want user (or `local`) sources.

## Plugin Sandbox Isolation

Plugins allowed but constrained via system prompt:
- Use only relative paths for project files
- Never navigate outside working directory
- Treat plugin-provided absolute paths as metadata-only (not for writing)
- Ensures all file mods stay in temp dir
- Pass plugins via `claudeCodeOptions.plugins` to test plugin workflows

## Implementation Status

- ✅ Phase 1: Single eval runner + deterministic scorers
- ✅ Phase 2: Multi-iteration + aggregated scoring + parallel execution + results export
- ✅ Phase 3: Multi-prompt parallel execution (v2.0)
- ⏳ Phase 4: LLM judges

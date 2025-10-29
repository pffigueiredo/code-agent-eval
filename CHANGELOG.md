# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- JSON export alongside markdown - `results.json` now written automatically when `resultsDir` is set
- `agentId` field in `EvalResult` for tracking which agent/model was used (defaults to 'claude-code')
- `agentId` optional config field in `EvalConfig` to override default agent identifier
- `writeResultsAsJson()` utility function exported for manual JSON export

### Changed
- Replaced `keepTempDir` boolean with `tempDirCleanup` enum for more flexible temp directory management
  - `'always'`: Delete after every iteration (default, equivalent to old `keepTempDir: false`)
  - `'on-failure'`: Keep only failed iteration directories (new feature)
  - `'never'`: Keep all directories (equivalent to old `keepTempDir: true`)

## [0.0.1-alpha.2] - 2025-10-28

### Added
- `promptId` field in `ScorerContext` interface - enables scorers to access which prompt variant is being evaluated, allowing dynamic scorer behavior based on prompt ID

## [0.0.1-alpha.1] - 2025-10-28

### Added

#### Core Features
- Main eval runner `runClaudeCodeEval()` with temp directory isolation
- Single iteration runner `runSingleIteration()`
- Auto package manager detection (npm/yarn/pnpm/bun) from lock files
- Auto dependency installation in isolated temp dirs
- Git diff capture of agent changes
- Multi-iteration support with aggregated results
- Multi-prompt evaluation support with unique identifiers

#### Execution Modes
- Sequential execution (default)
- Parallel execution (all iterations concurrently)
- Parallel with concurrency limits (`parallel-limit` mode)

#### Scoring System
- Unified `createScorer()` factory for all scorer types
- Command-based scorers (run shell commands)
- Custom logic scorers (JavaScript/TypeScript functions)
- Hybrid scorers (command + custom logic)
- Pre-built scorers: `buildSuccess()`, `testSuccess()`
- `ScorerContext` with `execCommand()` utility

#### Results & Export
- Results export to markdown files
- Per-iteration log files
- Aggregated results with statistics
- `writeResults()` and `formatResultsAsMarkdown()` utilities
- Configurable results directory

#### Environment Management
- Static environment variable injection
- Dynamic environment variable generation (sync/async functions)
- Environment variable validation

#### Agent Integration
- Claude Agent SDK integration with automated eval mode
- `permissionMode: 'bypassPermissions'` for autonomous operation
- Special system prompt for non-interactive execution
- Plugin support with sandbox isolation constraints
- Customizable agent options

#### Developer Experience
- TypeScript types: `EvalConfig`, `EvalResult`, `Scorer`, etc.
- Comprehensive public API exports
- Example scripts for all use cases
- Verbose logging mode
- Optional temp directory preservation (`keepTempDir`)

### Fixed
- Neon Drizzle plugin evaluation support
- Score logging output

### Documentation
- PRD (`code-agent-eval-prd.md`)
- Comprehensive `CLAUDE.md` with architecture, API, examples
- README with quick start
- Inline code documentation

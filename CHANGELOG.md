# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.0.1-alpha.1] - 2025-01-28

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

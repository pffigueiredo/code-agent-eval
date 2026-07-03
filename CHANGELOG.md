# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.1-alpha.10] - 2026-07-03

[compare changes](https://github.com/pffigueiredo/code-agent-eval/compare/v0.0.1-alpha.9...v0.0.1-alpha.10)

### 🚀 Enhancements

- **cli:** Configurable pass-rate threshold gating ([6290435](https://github.com/pffigueiredo/code-agent-eval/commit/6290435))
- **cli:** Fail-fast ANTHROPIC_API_KEY preflight ([3c7e4f6](https://github.com/pffigueiredo/code-agent-eval/commit/3c7e4f6))
- **cli:** --output artifact export (JUnit XML + JSON, extension-inferred) ([c23553d](https://github.com/pffigueiredo/code-agent-eval/commit/c23553d))
- **cli:** GitHub Step Summary output ([b271842](https://github.com/pffigueiredo/code-agent-eval/commit/b271842))

### 🩹 Fixes

- **release:** Choose latest dist-tag at publish time ([#19](https://github.com/pffigueiredo/code-agent-eval/pull/19))
- **deps:** Update non-major deps ([#20](https://github.com/pffigueiredo/code-agent-eval/pull/20))
- **cli:** Address review — align verdict, harden artifacts, drop dead flag ([e96fed5](https://github.com/pffigueiredo/code-agent-eval/commit/e96fed5))

### 📖 Documentation

- Document CI features (threshold, --output artifacts, exit codes) + example workflow ([2979231](https://github.com/pffigueiredo/code-agent-eval/commit/2979231))

### 🏡 Chore

- Trim AI-slop comments and over-built test assertion ([f27ad61](https://github.com/pffigueiredo/code-agent-eval/commit/f27ad61))
- **knip:** Drop redundant entry patterns (index.ts, cli.ts inferred from package.json) ([ac56336](https://github.com/pffigueiredo/code-agent-eval/commit/ac56336))

### 🎨 Styles

- Biome format the merged CI code (tabs, double quotes, template literals) ([cfd6d6e](https://github.com/pffigueiredo/code-agent-eval/commit/cfd6d6e))

### 🤖 CI

- Dogfood built binary in self-CI + upload real artifact ([225d210](https://github.com/pffigueiredo/code-agent-eval/commit/225d210))

### ❤️ Contributors

- Pedro Figueiredo <klisarkk@gmail.com>

## [0.0.1-alpha.9] - 2026-07-02

[compare changes](https://github.com/pffigueiredo/code-agent-eval/compare/v0.0.1-alpha.8...v0.0.1-alpha.9)

### 🚀 Enhancements

- JSON-authored eval configs (scorer registry, --print-schema, --dry-run) ([#10](https://github.com/pffigueiredo/code-agent-eval/pull/10))
- Comprehensive reliability guardrails (Biome, knip, publint, attw, audit, Renovate) ([#11](https://github.com/pffigueiredo/code-agent-eval/pull/11))

### 🩹 Fixes

- **deps:** Update non-major deps ([#14](https://github.com/pffigueiredo/code-agent-eval/pull/14))

### ❤️ Contributors

- Pedro Figueiredo <klisarkk@gmail.com>

## [0.0.1-alpha.8] - 2026-07-01

[compare changes](https://github.com/pffigueiredo/code-agent-eval/compare/v0.0.1-alpha.7...v0.0.1-alpha.8)

### 🚀 Enhancements

- **runner:** Enforce EvalConfig.timeout per iteration ([#6](https://github.com/pffigueiredo/code-agent-eval/pull/6))

### 🩹 Fixes

- **runner:** Honor bypass permissions on SDK 0.3 + capture agent-created files ([#4](https://github.com/pffigueiredo/code-agent-eval/pull/4))
- Config validation stripped scorer class instances to plain objects (`z.object` → `z.custom`), which broke `SkillPickedUpScorer` ([#3](https://github.com/pffigueiredo/code-agent-eval/pull/3))

### 💅 Refactors

- **BREAKING:** Class-based scorers — replace factory calls with constructors (`new BuildSuccessScorer()`, `new TestSuccessScorer()`, `new LintSuccessScorer()`, `new SkillPickedUpScorer()`); custom scorers extend the new `BaseScorer` abstract class instead of `createScorer()`. The `scorers` namespace export and `createScorer()` factory are removed ([#3](https://github.com/pffigueiredo/code-agent-eval/pull/3))

### 🏡 Chore

- Automate releases via CI (bumpp + changelogen + GitHub Release) ([#2](https://github.com/pffigueiredo/code-agent-eval/pull/2))
- **deps:** Upgrade dependencies + replace package-manager with nypm; bump `@anthropic-ai/claude-agent-sdk` to `0.3.187`, add `@anthropic-ai/sdk` + `@modelcontextprotocol/sdk` as direct deps ([#5](https://github.com/pffigueiredo/code-agent-eval/pull/5))
- **deps:** Bump tsdown 0.15.9 → 0.22.3, migrate build output to `.mjs`/`.d.mts` ([#7](https://github.com/pffigueiredo/code-agent-eval/pull/7))

### ❤️ Contributors

- Pedro Figueiredo <klisarkk@gmail.com>

## [0.0.1-alpha.7] - 2026-03-28

### Changed
- Extract eval config loader into `src/eval-config-loader.ts`; jiti alias resolves `'code-agent-eval'` so eval files work under `npx` without a project-local install
- Add `release:reminder` pre-hooks (`prerelease`, `prerelease:alpha`) to nudge `/prepare-release` before publish

### Added
- CLI tests for npx-style `.ts` and `.mjs` eval file imports
- SKILL.md: `projectDir` conventions and npx import resolution docs
- README: CLI section, updated features list and requirements

## [0.0.1-alpha.6] - 2026-03-22

### Added
- `code-agent-eval` CLI: `--eval-file` for `.ts`/`.js` eval configs (jiti), plus `--iterations`, `--verbose`, `--results-dir`, `--json`, `--dry-run`, `--show-skill`, `--no-agent-detect`, `--help`, `--version`; env overrides `CODE_AGENT_EVAL_*`; JSON on stdout when `--json` or agentic environment is detected (`am-i-vibing`)
- `skillPickedUp` built-in scorer for Skill tool invocations
- GitHub Actions workflow (Bun): install, typecheck, build, test

### Fixed
- Skill tool invocation display uses `input.skill`

## [0.0.1-alpha.5] - 2025-10-29

### Internal
- updated `@anthropic-ai/claude-agent-sdk` to latest

## [0.0.1-alpha.4] - 2025-10-29

### Removed
- `diff` field from `IterationResult` interface - git diffs no longer stored in results to reduce file bloat
  - Scorers still receive diff via `ScorerContext` during execution
  - Only affects stored/exported results (results.json, results.md)

## [0.0.1-alpha.3] - 2025-10-29

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

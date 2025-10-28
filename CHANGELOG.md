# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-10-28

### Breaking Changes

- **Multi-Prompt API**: `prompt: string` replaced with `prompts: Array<{id, prompt}>`
  - All eval configs now use `prompts` array instead of single `prompt` field
  - Single-prompt evaluations now use array of 1: `prompts: [{id: 'default', prompt: '...'}]`
  - Enables testing multiple prompt variants in parallel
  - Updates all examples, tests, and documentation

### Added

- **Multi-Prompt Parallel Execution**: Run multiple prompt variants simultaneously
  - Each prompt runs N iterations in parallel (fully concurrent: prompts × iterations)
  - Per-prompt pass rates displayed in console output and exported results
  - Prompt IDs included in iteration logs and markdown exports
  - New example: `examples/multi-prompt-parallel.ts` demonstrating 3 prompts × 3 iterations
- **Enhanced Results Export**:
  - Per-prompt statistics in markdown reports
  - Prompt ID column in iteration tables
  - Log filenames include prompt IDs: `iteration-{promptId}-{iterationId}.log`
- **Updated Types**:
  - `IterationResult` includes `promptId` field
  - `EnvGeneratorContext` includes `promptId` field for dynamic env generation

### Changed

- **Console Output**: Shows per-prompt pass rates when multiple prompts used
- **Result Aggregation**: Aggregates scores across all prompts and iterations
- **Validation**: Now requires at least one prompt in `prompts` array

### Migration

```typescript
// v0.2.0
{
  prompt: 'Add feature...'
}

// v2.0.0
{
  prompts: [{
    id: 'default',
    prompt: 'Add feature...'
  }]
}

// Multi-prompt usage (NEW)
{
  prompts: [
    { id: 'variant-1', prompt: '...' },
    { id: 'variant-2', prompt: '...' }
  ],
  iterations: 5,  // Each prompt runs 5 times
  execution: { mode: 'parallel' }  // All 10 runs concurrent
}
```

## [0.2.0] - 2025-10-27

### Breaking Changes

- **API Redesign**: `runClaudeCodeEval` now takes single config object instead of separate `iterations` parameter
  - `iterations` moved from function parameter into `EvalConfig` field
  - Enables better config serialization and sharing
  - More scalable for future features
  - Requires updating all existing code that calls `runClaudeCodeEval`

### Added

- **Parallel Execution Support**: Three new execution modes
  - `sequential`: Run iterations one at a time (default, same behavior as v0.1.x)
  - `parallel`: Run all iterations concurrently (auto-scales with system resources)
  - `parallel-limit`: Run with controlled concurrency limit
- **New Types**: `ExecutionMode` and `ExecutionConfig` for execution control
- **Updated EvalConfig**: Now includes `iterations` and `execution` fields
- **New Example**: `examples/parallel-execution.ts` demonstrating all three execution modes
- **Documentation**: Migration guide and updated API documentation
- **Tests**: New execution mode tests in `tests/execution-modes.test.ts`

### Changed

- **EvalConfig Interface**:
  - Added `iterations?: number` (default: 1) - moved from function parameter
  - Added `execution?: ExecutionConfig` (default: { mode: 'sequential' })
  - All configuration now in single object for better composability
- **Function Signature**: `runClaudeCodeEval(config)` → simpler, clearer API
- **Exports**: Added `ExecutionConfig` and `ExecutionMode` types to public API

### Migration

See [MIGRATION.md](./MIGRATION.md) for detailed upgrade guide from v0.1.x.

**Quick reference**:
```typescript
// v0.1.x
await runClaudeCodeEval(config, 5);

// v0.2.0
await runClaudeCodeEval({ ...config, iterations: 5 });

// v0.2.0 with parallel
await runClaudeCodeEval({
  ...config,
  iterations: 5,
  execution: { mode: 'parallel' },
});
```

## [0.1.0] - 2025-10-20

### Added

- **Core evaluation framework**: Multi-iteration evaluation runner
- **Phase 1 complete**: Single eval runner with deterministic scorers
- **Phase 2 complete**: Iterations + scoring system
- **Deterministic scorers**: Build, test, and lint validators
- **Environment variables**: Static and dynamic per-iteration injection
- **Git diff capture**: Track all changes made by Claude Code Agent
- **Aggregate metrics**: Pass rate, mean, min, max, standard deviation
- **Token usage tracking**: Monitor Claude API token consumption
- **Isolated execution**: Temp directory isolation with automatic cleanup
- **Examples**: Phase 1 and Phase 2 example scripts
- **Documentation**: CLAUDE.md with architecture and guidelines

### Features

- ✅ Multi-iteration evaluations with configurable iteration count
- ✅ Isolated execution in temporary directories
- ✅ Built-in build/test/lint scorers
- ✅ Aggregate metrics across iterations
- ✅ Environment variable injection (static or dynamic)
- ✅ Git diff capture for change tracking
- ✅ Flexible custom scorer support
- ✅ Token usage tracking

---

**[Unreleased]**

_No unreleased changes at this time._

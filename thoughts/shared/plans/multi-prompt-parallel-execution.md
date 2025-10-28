# Multi-Prompt Parallel Execution Implementation Plan

## Overview

Enable running multiple prompt variants simultaneously in parallel across multiple iterations. This is a breaking change that replaces the single `prompt: string` field with `prompts: Array<{id, prompt}>`, treating single-prompt evaluation as the special case (array of 1).

## Current State Analysis

**What exists:**
- `runClaudeCodeEval()` accepts single `prompt: string` field (src/runner.ts:13-35)
- Parallel execution modes: `sequential`, `parallel`, `parallel-limit` (src/runner.ts:489-603)
- Each mode runs N iterations of the same prompt
- Results aggregated per scorer across iterations (src/runner.ts:444-487)
- No prompt variant tracking in results

**What's changing:**
- API will accept `prompts: Array<{id: string, prompt: string}>` instead of `prompt: string`
- Execution will create matrix: prompts × iterations (fully parallel)
- Each `IterationResult` will include `promptId` field
- Single prompt case becomes `prompts: [{id: 'default', prompt: '...'}]`

**Key constraint from user:**
- No comparison logic (no winner selection, rankings, or comparison matrices)
- Just run all prompts in parallel and return raw results
- User will handle their own analysis

## Desired End State

After implementation:
```typescript
// Multi-prompt usage
await runClaudeCodeEval({
  name: 'test-auth-variants',
  prompts: [
    { id: 'vendor-v1', prompt: 'Add Supabase auth...' },
    { id: 'vendor-v2', prompt: 'Add Supabase with TypeScript...' },
    { id: 'custom', prompt: 'Integrate Supabase following Next.js 15 patterns...' }
  ],
  projectDir: './my-app',
  iterations: 5, // Each prompt runs 5 times
  execution: { mode: 'parallel' }, // All 15 runs (3×5) execute concurrently
  scorers: [scorers.buildSuccess()],
});
// Returns: 15 iterations total (3 prompts × 5 iterations each)

// Single prompt usage (backward compatible pattern)
await runClaudeCodeEval({
  name: 'single-test',
  prompts: [{ id: 'default', prompt: 'Add feature...' }],
  projectDir: './my-app',
  iterations: 3,
  scorers: [...]
});
```

### Verification Steps:
1. Run example with 2 prompts × 3 iterations = 6 total runs
2. Verify all 6 execute in parallel when `mode: 'parallel'`
3. Confirm each `IterationResult` has correct `promptId`
4. Check results export includes prompt IDs in iteration logs
5. Validate single-prompt case (array of 1) works identically to old API

## What We're NOT Doing

- No comparison logic (winner selection, rankings, comparison matrices)
- No backward compatibility shim (breaking change accepted)
- No prompt-level aggregation (only iteration-level and overall aggregation)
- No special handling of single-prompt case (it's just array of 1)
- No changes to scorer interface

## Implementation Approach

**Strategy**: Refactor execution to handle 2D matrix (prompts × iterations) instead of 1D array (iterations). Fully parallel mode runs all combinations concurrently using Promise.all().

**Key insight**: Existing `runSingleIteration()` already handles one prompt+iteration combo. We just need to:
1. Generate all combinations upfront
2. Run them in parallel (respecting execution mode)
3. Tag each result with promptId
4. Aggregate results properly

## Phase 1: Update Type Definitions

### Overview
Update TypeScript types to support multi-prompt configuration and prompt tracking in results.

### Changes Required:

#### 1. `src/runner.ts` - EvalConfig interface
**File**: `src/runner.ts:13-35`
**Changes**:
```typescript
export interface EvalConfig {
  name: string;
  prompts: Array<{    // CHANGED: was `prompt: string`
    id: string;       // NEW: unique identifier for this prompt variant
    prompt: string;   // NEW: the actual prompt text
  }>;
  projectDir: string;
  iterations?: number;
  execution?: ExecutionConfig;
  timeout?: number;
  scorers?: Scorer[];
  claudeCodeOptions?: Options;
  verbose?: boolean;
  keepTempDir?: boolean;
  resultsDir?: string;
  installDependencies?: boolean;
  environmentVariables?: /* ... existing type ... */;
}
```

#### 2. `src/types.ts` - IterationResult interface
**File**: `src/types.ts:57-68`
**Changes**:
```typescript
export interface IterationResult {
  iterationId: number;
  promptId: string;         // NEW: which prompt variant was used
  success: boolean;
  duration: number;
  scores: Record<string, ScorerResult>;
  diff: string;
  agentOutput: string;
  tokenUsage?: TokenUsage;
  workingDir?: string;
  environmentVariables: Record<string, string>;
  error?: string;
}
```

#### 3. `src/types.ts` - EnvGeneratorContext interface
**File**: `src/types.ts:51-55`
**Changes**:
```typescript
export interface EnvGeneratorContext {
  iteration: number;
  promptId: string;         // NEW: which prompt is being run
  evalName: string;
  totalIterations?: number;
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `npm run typecheck`
- [ ] No type errors in runner.ts or types.ts

#### Manual Verification:
- [ ] IDE shows correct autocomplete for `prompts` array
- [ ] Type errors appear if trying to use old `prompt: string` API

---

## Phase 2: Refactor Runner Core Logic

### Overview
Update `runClaudeCodeEval()` and execution functions to generate prompt×iteration combinations and track promptId through the execution pipeline.

### Changes Required:

#### 1. `src/runner.ts` - Update runSingleIteration signature
**File**: `src/runner.ts:242-245`
**Changes**:
```typescript
async function runSingleIteration(
  config: EvalConfig,
  context: EnvGeneratorContext,
  promptId: string,          // NEW: which prompt to run
  prompt: string             // NEW: the actual prompt text
): Promise<IterationResult>
```

**Update body** (src/runner.ts:310):
```typescript
const result = query({
  prompt: prompt,  // Use passed-in prompt instead of config.prompt
  options: { /* ... */ }
});
```

**Update return** (src/runner.ts:405-415):
```typescript
return {
  iterationId: context.iteration,
  promptId,  // NEW: include promptId in result
  success,
  duration,
  // ... rest unchanged
};
```

#### 2. `src/runner.ts` - Refactor runSequential
**File**: `src/runner.ts:489-513`
**Changes**:
```typescript
async function runSequential(
  config: EvalConfig,
  iterations: number
): Promise<IterationResult[]> {
  const results: IterationResult[] = [];

  // Generate all combinations: prompts × iterations
  const combinations: Array<{promptId: string, prompt: string, iteration: number}> = [];
  for (const promptConfig of config.prompts) {
    for (let i = 0; i < iterations; i++) {
      combinations.push({
        promptId: promptConfig.id,
        prompt: promptConfig.prompt,
        iteration: results.length  // Sequential iteration numbering
      });
    }
  }

  // Run each combination sequentially
  for (const combo of combinations) {
    const context: EnvGeneratorContext = {
      iteration: combo.iteration,
      promptId: combo.promptId,
      evalName: config.name,
      totalIterations: combinations.length,
    };

    const result = await runSingleIteration(config, context, combo.promptId, combo.prompt);
    results.push(result);

    console.log(`\n[Prompt: ${combo.promptId}] [Iteration ${combo.iteration}] ${result.success ? '✓ PASSED' : '✗ FAILED'} in ${(result.duration / 1000).toFixed(2)}s`);
  }

  return results;
}
```

#### 3. `src/runner.ts` - Refactor runParallel
**File**: `src/runner.ts:515-545`
**Changes**:
```typescript
async function runParallel(
  config: EvalConfig,
  iterations: number
): Promise<IterationResult[]> {
  // Generate all combinations: prompts × iterations
  const combinations: Array<{promptId: string, prompt: string, iteration: number}> = [];
  let iterationCounter = 0;
  for (const promptConfig of config.prompts) {
    for (let i = 0; i < iterations; i++) {
      combinations.push({
        promptId: promptConfig.id,
        prompt: promptConfig.prompt,
        iteration: iterationCounter++
      });
    }
  }

  console.log(`Running ${combinations.length} total runs (${config.prompts.length} prompts × ${iterations} iterations) in parallel (unbounded)...`);

  // Create all promises and run in parallel
  const promises = combinations.map(combo => {
    const context: EnvGeneratorContext = {
      iteration: combo.iteration,
      promptId: combo.promptId,
      evalName: config.name,
      totalIterations: combinations.length,
    };

    return runSingleIteration(config, context, combo.promptId, combo.prompt).then(result => {
      console.log(`\n[Prompt: ${combo.promptId}] [Iteration ${combo.iteration}] ${result.success ? '✓ PASSED' : '✗ FAILED'} in ${(result.duration / 1000).toFixed(2)}s`);
      return result;
    });
  });

  const results = await Promise.all(promises);
  return results.sort((a, b) => a.iterationId - b.iterationId);
}
```

#### 4. `src/runner.ts` - Refactor runParallelWithLimit
**File**: `src/runner.ts:574-603`
**Changes**: Same pattern as `runParallel`, but use `pLimit()` helper for concurrency control.

```typescript
async function runParallelWithLimit(
  config: EvalConfig,
  iterations: number,
  concurrency: number
): Promise<IterationResult[]> {
  // Generate all combinations
  const combinations: Array<{promptId: string, prompt: string, iteration: number}> = [];
  let iterationCounter = 0;
  for (const promptConfig of config.prompts) {
    for (let i = 0; i < iterations; i++) {
      combinations.push({
        promptId: promptConfig.id,
        prompt: promptConfig.prompt,
        iteration: iterationCounter++
      });
    }
  }

  console.log(`Running ${combinations.length} total runs (${config.prompts.length} prompts × ${iterations} iterations) in parallel (concurrency: ${concurrency})...`);

  // Create task functions
  const tasks = combinations.map(combo => {
    return async () => {
      const context: EnvGeneratorContext = {
        iteration: combo.iteration,
        promptId: combo.promptId,
        evalName: config.name,
        totalIterations: combinations.length,
      };

      const result = await runSingleIteration(config, context, combo.promptId, combo.prompt);
      console.log(`\n[Prompt: ${combo.promptId}] [Iteration ${combo.iteration}] ${result.success ? '✓ PASSED' : '✗ FAILED'} in ${(result.duration / 1000).toFixed(2)}s`);
      return result;
    };
  });

  const results = await pLimit(tasks, concurrency);
  return results.sort((a, b) => a.iterationId - b.iterationId);
}
```

#### 5. `src/runner.ts` - Update validation
**File**: `src/runner.ts:608-620`
**Changes**:
```typescript
export async function runClaudeCodeEval(
  config: EvalConfig
): Promise<EvalResult> {
  const startTime = Date.now();
  const iterations = config.iterations || 1;
  const execution = config.execution || { mode: 'sequential' as const };

  // Validation
  if (!config.prompts || config.prompts.length === 0) {
    throw new Error('At least one prompt is required in config.prompts array');
  }
  if (execution.mode === 'parallel-limit' && !execution.concurrency) {
    throw new Error('concurrency is required when mode is "parallel-limit"');
  }

  const totalRuns = config.prompts.length * iterations;
  console.log(`\nStarting evaluation "${config.name}" with ${config.prompts.length} prompt(s) × ${iterations} iteration(s) = ${totalRuns} total runs (${execution.mode})...\n`);

  // ... rest unchanged
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `npm run typecheck`
- [ ] All unit tests pass: `npm run test`

#### Manual Verification:
- [ ] Sequential mode runs all prompt×iteration combinations in order
- [ ] Parallel mode runs all combinations concurrently
- [ ] Console logs show correct prompt IDs
- [ ] Each IterationResult has correct promptId field

---

## Phase 3: Update Results Aggregation

### Overview
Update aggregate score calculation to handle multiple prompts. Keep per-scorer aggregation across ALL iterations (no per-prompt breakdown).

### Changes Required:

#### 1. `src/runner.ts` - Update calculateAggregateScores
**File**: `src/runner.ts:444-487`
**Changes**: No changes needed - function already aggregates across all iterations regardless of promptId.

#### 2. `src/runner.ts` - Update summary console output
**File**: `src/runner.ts:639-693`
**Changes**:
```typescript
console.log('='.repeat(60));
console.log('EVALUATION SUMMARY');
console.log('='.repeat(60));
console.log(`Eval Name: ${config.name}`);
console.log(`Total Duration: ${(duration / 1000).toFixed(2)}s`);
console.log(`Prompts: ${config.prompts.length}`);           // NEW
console.log(`Iterations per prompt: ${iterations}`);         // NEW
console.log(`Total runs: ${results.length}`);                // CHANGED
console.log(`Pass Rate: ${(aggregateScores._overall.passRate * 100).toFixed(1)}%`);
console.log(`Status: ${overallSuccess ? '✓ ALL PASSED' : '✗ SOME FAILED'}`);

// NEW: Show per-prompt pass rates
console.log('\nPer-Prompt Results:');
for (const promptConfig of config.prompts) {
  const promptResults = results.filter(r => r.promptId === promptConfig.id);
  const promptPassRate = promptResults.filter(r => r.success).length / promptResults.length;
  console.log(`  ${promptConfig.id}: ${(promptPassRate * 100).toFixed(1)}% pass rate (${promptResults.filter(r => r.success).length}/${promptResults.length})`);
}

// ... rest unchanged
```

### Success Criteria:

#### Automated Verification:
- [ ] Summary shows correct total run count (prompts × iterations)
- [ ] Per-prompt pass rates calculated correctly

#### Manual Verification:
- [ ] Console output clearly shows which prompt each result belongs to
- [ ] Per-prompt statistics are accurate

---

## Phase 4: Update Results Export

### Overview
Update results writer to include prompt IDs in exported logs and markdown.

### Changes Required:

#### 1. `src/results-writer.ts` - Update formatResultsAsMarkdown
**File**: `src/results-writer.ts:*`
**Changes**:
```typescript
export function formatResultsAsMarkdown(result: EvalResult): string {
  let markdown = `# Evaluation Results: ${result.evalName}\n\n`;
  markdown += `**Timestamp**: ${result.timestamp}\n`;
  markdown += `**Status**: ${result.success ? '✅ Success' : '❌ Failed'}\n`;
  markdown += `**Duration**: ${(result.duration / 1000).toFixed(2)}s\n`;
  markdown += `**Total Runs**: ${result.iterations.length}\n\n`;  // CHANGED

  // NEW: Per-prompt summary
  const promptIds = [...new Set(result.iterations.map(i => i.promptId))];
  if (promptIds.length > 1) {
    markdown += `## Prompts Tested\n\n`;
    for (const promptId of promptIds) {
      const promptResults = result.iterations.filter(i => i.promptId === promptId);
      const passRate = promptResults.filter(r => r.success).length / promptResults.length;
      markdown += `- **${promptId}**: ${(passRate * 100).toFixed(1)}% pass rate (${promptResults.length} runs)\n`;
    }
    markdown += `\n`;
  }

  // ... rest of existing markdown generation

  // Update iteration table to include promptId column
  markdown += `## Iteration Results\n\n`;
  markdown += `| Iteration | Prompt ID | Status | Duration | Scores |\n`;  // NEW: Prompt ID column
  markdown += `|-----------|-----------|--------|----------|--------|\n`;

  for (const iter of result.iterations) {
    const status = iter.success ? '✅' : '❌';
    const duration = `${(iter.duration / 1000).toFixed(2)}s`;
    const scores = Object.entries(iter.scores)
      .map(([name, score]) => `${name}: ${score.score.toFixed(2)}`)
      .join(', ');
    markdown += `| ${iter.iterationId} | ${iter.promptId} | ${status} | ${duration} | ${scores} |\n`;  // NEW: promptId column
  }

  return markdown;
}
```

#### 2. `src/results-writer.ts` - Update iteration log filenames
**File**: `src/results-writer.ts:*`
**Changes**:
```typescript
export async function writeResults(
  result: EvalResult,
  baseDir: string
): Promise<string> {
  // ... existing directory creation logic

  // Write iteration logs with prompt ID in filename
  for (const iteration of result.iterations) {
    const logFilename = `iteration-${iteration.promptId}-${iteration.iterationId}.log`;  // CHANGED: include promptId
    const logPath = path.join(outputDir, logFilename);
    await fs.writeFile(logPath, iteration.agentOutput, 'utf-8');
  }

  // ... rest unchanged
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Markdown export includes per-prompt statistics
- [ ] Iteration logs named with prompt IDs

#### Manual Verification:
- [ ] Generated markdown is readable and includes prompt breakdown
- [ ] Log files clearly indicate which prompt they belong to

---

## Phase 5: Update Examples and Tests

### Overview
Update example scripts to demonstrate multi-prompt usage and ensure tests cover new functionality.

### Changes Required:

#### 1. `examples/phase1-single-run.ts` - Update to new API
**File**: `examples/phase1-single-run.ts`
**Changes**:
```typescript
const result = await runClaudeCodeEval({
  name: 'single-iteration-test',
  prompts: [{                                    // CHANGED: array wrapper
    id: 'default',
    prompt: 'Based on https://registry.npmjs.org/@neondatabase/neon-js migrate from SupabaseJS to NeonJS.'
  }],
  projectDir: '/Users/pedro.figueiredo/Documents/git/personal/todo-guardian-pro-supabasejs',
  // ... rest unchanged
});
```

#### 2. `examples/phase2-multi-iteration.ts` - Update to new API
**File**: `examples/phase2-multi-iteration.ts`
**Changes**: Same pattern - wrap single prompt in array with `id: 'default'`.

#### 3. `examples/parallel-execution.ts` - Update to new API
**File**: `examples/parallel-execution.ts`
**Changes**: Same pattern.

#### 4. `examples/plugin-execution.ts` - Update to new API
**File**: `examples/plugin-execution.ts`
**Changes**: Same pattern.

#### 5. NEW: `examples/multi-prompt-parallel.ts`
**File**: `examples/multi-prompt-parallel.ts` (NEW)
**Changes**: Create new example demonstrating multi-prompt usage:
```typescript
import { EvalConfig, runClaudeCodeEval, scorers } from '../src';

async function main() {
  const result = await runClaudeCodeEval({
    name: 'multi-prompt-auth-test',
    prompts: [
      {
        id: 'vendor-basic',
        prompt: 'Add Supabase authentication with email/password'
      },
      {
        id: 'vendor-detailed',
        prompt: 'Add Supabase authentication with email/password. Use TypeScript types and follow Next.js 15 patterns.'
      },
      {
        id: 'custom',
        prompt: 'Integrate Supabase authentication with email/password support. Use TypeScript strict mode, add error handling, and follow Next.js 15 App Router patterns.'
      }
    ],
    projectDir: './test-project',
    iterations: 3,
    execution: { mode: 'parallel' }, // All 9 runs (3 prompts × 3 iterations) execute concurrently
    scorers: [scorers.buildSuccess()],
    keepTempDir: false,
  });

  console.log('\n=== RESULTS BY PROMPT ===');
  const promptIds = [...new Set(result.iterations.map(i => i.promptId))];
  for (const promptId of promptIds) {
    const promptResults = result.iterations.filter(i => i.promptId === promptId);
    const passRate = promptResults.filter(r => r.success).length / promptResults.length;
    console.log(`${promptId}: ${(passRate * 100).toFixed(1)}% pass rate`);
  }
}

main().catch(console.error);
```

#### 6. `tests/index.test.ts` - Update tests
**File**: `tests/index.test.ts`
**Changes**: Update test configs to use new `prompts` array format.

### Success Criteria:

#### Automated Verification:
- [ ] All examples run without TypeScript errors: `npx tsx examples/*.ts`
- [ ] All tests pass: `npm run test`

#### Manual Verification:
- [ ] Multi-prompt example shows correct parallel execution
- [ ] Single-prompt examples work identically to before (just with array wrapper)

---

## Phase 6: Update Documentation

### Overview
Update README, CLAUDE.md, and PRD to reflect breaking changes and new multi-prompt API.

### Changes Required:

#### 1. `README.md` - Update usage examples
**File**: `README.md`
**Changes**: Update all code examples to use new `prompts` array format. Add section on multi-prompt evaluation.

#### 2. `CLAUDE.md` - Update API documentation
**File**: `CLAUDE.md`
**Changes**:
- Update EvalConfig options to show `prompts` array
- Add multi-prompt example
- Note breaking change from v1.x

#### 3. `cc-eval-prd.md` - Mark Phase 3 complete
**File**: `cc-eval-prd.md:364-369`
**Changes**: Update implementation status:
```markdown
## Implementation Status

- ✅ Phase 1: Single eval runner + deterministic scorers
- ✅ Phase 2: Multi-iteration + aggregated scoring + parallel execution + results export
- ✅ Phase 3: A/B testing multiple prompts (multi-prompt parallel execution)
- ⏳ Phase 4: LLM judges
```

#### 4. `CHANGELOG.md` - Add breaking change entry
**File**: `CHANGELOG.md`
**Changes**: Add v2.0.0 entry documenting breaking changes.

### Success Criteria:

#### Automated Verification:
- [ ] No broken links in markdown files
- [ ] Code examples have valid TypeScript syntax

#### Manual Verification:
- [ ] Documentation clearly explains breaking changes
- [ ] Multi-prompt usage examples are clear and complete

---

## Testing Strategy

### Unit Tests:
- Type validation for new `prompts` array field
- Validation error when `prompts` is empty
- Correct iteration count calculation (prompts × iterations)
- PromptId correctly propagated through pipeline

### Integration Tests:
- Run eval with 2 prompts × 2 iterations = 4 total runs
- Verify all 4 IterationResults have correct promptIds
- Verify parallel mode runs all 4 concurrently
- Verify sequential mode runs in correct order
- Verify results export includes prompt IDs

### Manual Testing Steps:
1. Run `examples/multi-prompt-parallel.ts` with 3 prompts × 3 iterations
2. Verify 9 total runs execute in parallel
3. Check console output shows correct prompt IDs
4. Verify exported results include per-prompt statistics
5. Check iteration log filenames include prompt IDs

## Performance Considerations

**Impact of full parallelization:**
- 3 prompts × 5 iterations = 15 concurrent Claude API calls
- May hit rate limits on free tier Anthropic accounts
- High memory/CPU usage during parallel execution

**Mitigation:**
- Document recommended concurrency limits
- Suggest using `parallel-limit` mode for large matrices
- Add example showing staged execution (e.g., 5 concurrency)

## Migration Notes

**Breaking Changes:**
```typescript
// Old API (v1.x)
{
  prompt: 'Add feature...'
}

// New API (v2.0)
{
  prompts: [{
    id: 'default',  // or any meaningful ID
    prompt: 'Add feature...'
  }]
}
```

**Migration script** (one-liner):
```bash
# Users can update their configs manually
# No automated migration needed - just update to array format
```

## References

- Braintrust experiments: https://www.braintrust.dev/docs/reference/api/Experiments
- Promptfoo YAML config: https://www.promptfoo.dev/docs/configuration/guide/
- Existing parallel execution: src/runner.ts:515-603
- PRD Phase 3: cc-eval-prd.md:170-215

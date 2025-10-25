# Claude Code Eval Library - Phased Implementation Plan

## Overview

Building a TypeScript library for evaluating Claude Code prompts against real codebases. The library will run prompts multiple times, capture code changes, score results using deterministic and LLM-based judges, and support A/B comparison between prompt variations.

**Key Principle**: Original codebases remain UNTOUCHED. All Claude Code modifications happen in isolated temporary directories that are created per-iteration and cleaned up afterwards.

## Progress Tracker

- [ ] **Phase 1**: Single Eval Runner (Core Loop) - CURRENT PHASE
- [ ] **Phase 2**: Iterations + Scoring System
- [ ] **Phase 3**: Comparison Mode
- [ ] **Phase 4**: LLM Judges
- [ ] **Phase 5**: Polish & Publish

---

## Phase 1: Single Eval Runner (Core Loop)

**Status**: 🚧 In Progress
**Goal**: Run a single prompt against a codebase once, capture changes, verify build/test/lint passes.
**Estimated Time**: 4-6 hours

### Overview

The foundation of the eval system. Takes a user's existing codebase (template), copies it to a temp directory, runs Claude Code Agent SDK with a prompt, captures the git diff of changes, and validates the result by running build/test/lint commands.

### What We're Building

1. **Core Types** (`src/types.ts`):
   - `EvalConfig` interface for eval configuration
   - `EvalResult` interface for results
   - `ScorerResult` interface for individual scorer outputs

2. **Eval Runner** (`src/runner.ts`):
   - `runSingleIteration()` - Execute one eval run
   - Project directory copying to temp location
   - Claude Code Agent SDK integration
   - Git diff capture after agent completes
   - Temp directory cleanup

3. **Basic Scorers** (`src/scorers/code.ts`):
   - `buildSuccess()` - Runs build command, returns 1.0 if passes
   - `testSuccess()` - Runs test command, returns 1.0 if passes
   - `lintSuccess()` - Runs lint command, returns 1.0 if passes

4. **Main API** (`src/index.ts`):
   - Export core types
   - Export runner functions
   - Export built-in scorers

### Key Requirements

#### Temp Directory Isolation
- Copy entire project to `/tmp/eval-{uuid}/`
- Preserve git history (needed for diff capture)
- Agent SDK operates ONLY in temp directory
- Original codebase at `projectDir` is NEVER modified
- Cleanup temp dir after run (unless `EVAL_DEBUG=1` env var set)

#### Claude Code Agent SDK Integration
```typescript
import { Agent } from '@anthropic-ai/claude-agent-sdk';

const agent = new Agent({
  apiKey: process.env.ANTHROPIC_API_KEY,
  workingDirectory: tempDir,
  timeout: config.timeout
});

const result = await agent.run(config.prompt);
```

#### Git Diff Capture
After agent completes:
```bash
cd <tempDir>
git diff HEAD > changes.diff
```

#### Scorer Execution
Run project's package.json scripts:
```bash
npm run build  # or yarn/pnpm based on lockfile detection
npm run test
npm run lint
```

### Changes Required

#### 1. Install Dependencies
**File**: `package.json`
**Changes**: Add required dependencies

```json
{
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^1.0.0",
    "execa": "^9.0.0",
    "fs-extra": "^11.2.0",
    "zod": "^3.23.0"
  }
}
```

#### 2. Create Core Types
**File**: `src/types.ts` (new)
**Changes**: Define TypeScript interfaces

```typescript
export interface EvalConfig {
  name: string;
  prompt: string;
  projectDir: string; // Path to user's codebase (original, untouched)
  timeout?: number; // Default: 600000ms (10 minutes)
  scorers?: Scorer[];
}

export interface Scorer {
  name: string;
  fn: (context: ScorerContext) => Promise<ScorerResult>;
}

export interface ScorerContext {
  workingDir: string; // Temp directory where changes were made
  diff: string; // Git diff output
  agentOutput: string; // Raw agent response
}

export interface ScorerResult {
  score: number; // 0.0 to 1.0
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface EvalResult {
  evalName: string;
  timestamp: string;
  success: boolean;
  duration: number; // milliseconds
  scores: Record<string, ScorerResult>;
  diff: string;
  workingDir?: string; // Only set if EVAL_DEBUG=1
  error?: string;
}
```

#### 3. Implement Eval Runner
**File**: `src/runner.ts` (new)
**Changes**: Core evaluation execution logic

```typescript
import { Agent } from '@anthropic-ai/claude-agent-sdk';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'crypto';
import type { EvalConfig, EvalResult, Scorer } from './types';

export async function runSingleIteration(config: EvalConfig): Promise<EvalResult> {
  const startTime = Date.now();
  const evalId = randomUUID();
  const tempDir = path.join('/tmp', `eval-${evalId}`);

  try {
    // 1. Copy project to temp directory (preserving git history)
    console.log(`Copying ${config.projectDir} to ${tempDir}...`);
    await fs.copy(config.projectDir, tempDir, {
      filter: (src) => {
        // Skip node_modules but keep everything else including .git
        return !src.includes('node_modules');
      }
    });

    // 2. Initialize git in temp dir if not already a repo
    const isGitRepo = await fs.pathExists(path.join(tempDir, '.git'));
    if (!isGitRepo) {
      await execa('git', ['init'], { cwd: tempDir });
      await execa('git', ['add', '.'], { cwd: tempDir });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: tempDir });
    }

    // 3. Initialize Claude Code Agent SDK
    console.log('Initializing Claude Code Agent...');
    const agent = new Agent({
      apiKey: process.env.ANTHROPIC_API_KEY!,
      workingDirectory: tempDir,
      timeout: config.timeout || 600000
    });

    // 4. Run agent with user's prompt
    console.log(`Running prompt: "${config.prompt}"...`);
    const agentOutput = await agent.run(config.prompt);

    // 5. Capture git diff
    console.log('Capturing changes...');
    const { stdout: diff } = await execa('git', ['diff', 'HEAD'], { cwd: tempDir });

    // 6. Run scorers
    console.log('Running scorers...');
    const scores: Record<string, ScorerResult> = {};
    for (const scorer of config.scorers || []) {
      const result = await scorer.fn({
        workingDir: tempDir,
        diff,
        agentOutput: JSON.stringify(agentOutput)
      });
      scores[scorer.name] = result;
    }

    const duration = Date.now() - startTime;
    const success = Object.values(scores).every(s => s.score === 1.0);

    return {
      evalName: config.name,
      timestamp: new Date().toISOString(),
      success,
      duration,
      scores,
      diff,
      workingDir: process.env.EVAL_DEBUG ? tempDir : undefined
    };

  } catch (error) {
    return {
      evalName: config.name,
      timestamp: new Date().toISOString(),
      success: false,
      duration: Date.now() - startTime,
      scores: {},
      diff: '',
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    // 7. Cleanup (unless debug mode)
    if (!process.env.EVAL_DEBUG) {
      console.log('Cleaning up temp directory...');
      await fs.remove(tempDir);
    } else {
      console.log(`Debug mode: temp directory preserved at ${tempDir}`);
    }
  }
}
```

#### 4. Implement Code Scorers
**File**: `src/scorers/code.ts` (new)
**Changes**: Deterministic build/test/lint scorers

```typescript
import { execa } from 'execa';
import type { Scorer } from '../types';

export function buildSuccess(): Scorer {
  return {
    name: 'build',
    fn: async ({ workingDir }) => {
      try {
        await execa('npm', ['run', 'build'], {
          cwd: workingDir,
          timeout: 300000 // 5 minutes
        });
        return { score: 1.0, reason: 'Build passed' };
      } catch (error) {
        return {
          score: 0.0,
          reason: `Build failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  };
}

export function testSuccess(): Scorer {
  return {
    name: 'test',
    fn: async ({ workingDir }) => {
      try {
        await execa('npm', ['run', 'test'], {
          cwd: workingDir,
          timeout: 300000
        });
        return { score: 1.0, reason: 'Tests passed' };
      } catch (error) {
        return {
          score: 0.0,
          reason: `Tests failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  };
}

export function lintSuccess(): Scorer {
  return {
    name: 'lint',
    fn: async ({ workingDir }) => {
      try {
        await execa('npm', ['run', 'lint'], {
          cwd: workingDir,
          timeout: 60000
        });
        return { score: 1.0, reason: 'Lint passed' };
      } catch (error) {
        return {
          score: 0.0,
          reason: `Lint failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  };
}
```

#### 5. Create Public API
**File**: `src/index.ts`
**Changes**: Replace placeholder with real exports

```typescript
// Types
export type { EvalConfig, EvalResult, Scorer, ScorerContext, ScorerResult } from './types';

// Core runner
export { runSingleIteration } from './runner';

// Built-in scorers
import * as codeScorers from './scorers/code';
export const scorers = {
  buildSuccess: codeScorers.buildSuccess,
  testSuccess: codeScorers.testSuccess,
  lintSuccess: codeScorers.lintSuccess
};
```

#### 6. Create Example
**File**: `examples/phase1-single-run.ts` (new)
**Changes**: Working example of Phase 1 functionality

```typescript
import { runSingleIteration, scorers } from '../src';

async function main() {
  console.log('Running Phase 1 eval example...\n');

  const result = await runSingleIteration({
    name: 'test-simple-change',
    prompt: 'Add a new function called `greet` that takes a name and returns "Hello, {name}!"',
    projectDir: process.cwd(), // Use this project as template
    scorers: [
      scorers.buildSuccess(),
      scorers.testSuccess()
    ]
  });

  console.log('\n=== EVAL RESULT ===');
  console.log(`Success: ${result.success}`);
  console.log(`Duration: ${result.duration}ms`);
  console.log('\nScores:');
  Object.entries(result.scores).forEach(([name, score]) => {
    console.log(`  ${name}: ${score.score} - ${score.reason}`);
  });

  if (result.diff) {
    console.log('\n=== CHANGES ===');
    console.log(result.diff);
  }

  if (result.error) {
    console.error('\n=== ERROR ===');
    console.error(result.error);
  }
}

main().catch(console.error);
```

### Success Criteria

#### Automated Verification
- [ ] `npm install` completes without errors
- [ ] `npm run build` compiles TypeScript successfully
- [ ] `npm run typecheck` passes with no type errors
- [ ] Can import types from package: `import { EvalConfig } from 'claude-code-eval'`

#### Manual Verification
- [ ] Run example script: `npx tsx examples/phase1-single-run.ts`
- [ ] Verify original `projectDir` is untouched (no modifications)
- [ ] Verify temp directory is created in `/tmp/eval-*`
- [ ] Verify temp directory is deleted after run (when `EVAL_DEBUG` not set)
- [ ] When `EVAL_DEBUG=1`, verify temp directory is preserved
- [ ] Verify git diff captures Claude Code's changes
- [ ] Verify scorers run and return 0.0 or 1.0 scores
- [ ] If build/test/lint commands exist in project, they execute correctly
- [ ] If commands don't exist, scorer fails gracefully with error message

### What We're NOT Doing in Phase 1

❌ Multiple iterations (runs once only)
❌ Pass rate calculation (no aggregation yet)
❌ Comparison mode
❌ LLM judges
❌ JSON export to files
❌ Pretty terminal output
❌ Smart package manager detection (npm only)
❌ Progress bars or fancy UX

---

## Phase 2: Iterations + Scoring System

**Status**: ⏳ Not Started
**Goal**: Run prompts multiple times, aggregate results, calculate metrics
**Estimated Time**: 4-6 hours

### Overview

Extend Phase 1 to support running the same prompt multiple times (iterations) and aggregate results into meaningful metrics (pass rate, average scores, consistency).

### What We're Building

1. **`runEval()` function** - Wraps `runSingleIteration()` to run N times
2. **Aggregated results** - Calculate pass rate, avg duration, score aggregation
3. **JSON export** - Save results to file for version control
4. **Basic terminal output** - Simple summary table

### Key Features

```typescript
interface EvalConfig {
  // ... Phase 1 fields
  iterations: number; // NEW: default 3
  outputDir?: string; // NEW: where to save results JSON
}

interface AggregatedEvalResult {
  evalName: string;
  totalIterations: number;
  successful: number;
  passRate: number; // 0.0 to 1.0
  avgDuration: number;
  iterations: EvalResult[]; // All individual results
  aggregatedScores: Record<string, {
    avg: number;
    min: number;
    max: number;
    stdDev: number;
  }>;
}

async function runEval(config: EvalConfig): Promise<AggregatedEvalResult>
```

### Changes Required

- Extend `EvalConfig` with `iterations` field
- Create `AggregatedEvalResult` type
- Implement `runEval()` that calls `runSingleIteration()` N times
- Aggregate results (pass rate, averages, std dev)
- Export results to JSON file
- Terminal output with table formatting

### Success Criteria

#### Automated Verification
- [ ] Type definitions include new aggregated types
- [ ] Build passes after changes

#### Manual Verification
- [ ] Run prompt 5 times, verify 5 temp directories are created/cleaned
- [ ] Pass rate correctly calculated (e.g., 4/5 = 0.8)
- [ ] JSON file written to specified output directory
- [ ] JSON file can be read and parsed
- [ ] Terminal output shows summary table with metrics

### What We're NOT Doing in Phase 2

❌ Comparison mode
❌ LLM judges
❌ Parallel execution (sequential only)
❌ Fancy terminal UI (no progress bars yet)

---

## Phase 3: Comparison Mode

**Status**: ⏳ Not Started
**Goal**: A/B test multiple prompts, identify winner
**Estimated Time**: 4-6 hours

### Overview

Add `comparePrompts()` function that runs multiple prompts for the same task and compares their results side-by-side to identify the most reliable approach.

### What We're Building

1. **`comparePrompts()` function** - Run multiple evals and compare
2. **Winner selection logic** - Identify best prompt based on composite score
3. **Comparison output** - Side-by-side results table
4. **Delta calculations** - Show relative differences between prompts

### Key Features

```typescript
interface ComparisonConfig {
  name: string;
  prompts: Record<string, string>; // name -> prompt text
  projectDir: string;
  iterations: number;
  scorers: Scorer[];
  winnerStrategy?: 'passRate' | 'avgScore' | 'composite'; // default: composite
}

interface ComparisonResult {
  comparisonName: string;
  winner: string; // Key of winning prompt
  results: Record<string, AggregatedEvalResult>;
  sideBySide: {
    passRates: Record<string, number>;
    avgScores: Record<string, number>;
    deltas: Record<string, number>; // Relative to winner
  };
}

async function comparePrompts(config: ComparisonConfig): Promise<ComparisonResult>
```

### Changes Required

- Create `ComparisonConfig` and `ComparisonResult` types
- Implement `comparePrompts()` function
- Winner selection logic (configurable strategy)
- Side-by-side comparison table generator
- Markdown export for comparison results

### Success Criteria

#### Automated Verification
- [ ] Build passes with new comparison types

#### Manual Verification
- [ ] Run comparison with 3 different prompts
- [ ] Verify each prompt runs independently (no cross-contamination)
- [ ] Winner correctly identified based on selected strategy
- [ ] Side-by-side table shows relative performance
- [ ] Can export comparison to markdown for documentation

### What We're NOT Doing in Phase 3

❌ LLM judges (still deterministic only)
❌ Statistical significance testing
❌ Visual charts/graphs

---

## Phase 4: LLM Judges

**Status**: ⏳ Not Started
**Goal**: Add subjective code quality scoring using LLM judges
**Estimated Time**: 4-6 hours

### Overview

Implement LLM-based scorers that evaluate code quality, prompt adherence, and other subjective criteria using Claude or GPT-4 as judges.

### What We're Building

1. **LLM judge scorer** (`src/scorers/llm.ts`)
2. **Code quality evaluation** - Judge code patterns, best practices
3. **Prompt following** - Verify output matches prompt intent
4. **Configurable criteria** - User-defined evaluation criteria

### Key Features

```typescript
export function codeQuality(options: {
  criteria: string;
  model?: 'claude-3-5-sonnet' | 'gpt-4';
}): Scorer;

export function promptFollowing(options: {
  model?: 'claude-3-5-sonnet' | 'gpt-4';
}): Scorer;

// Usage
scorers.codeQuality({
  criteria: 'Uses TypeScript best practices, proper error handling, follows Next.js patterns'
})
```

### Changes Required

- Add `@anthropic-ai/sdk` or `openai` dependencies
- Create `src/scorers/llm.ts`
- Implement LLM judge prompt templates
- Parse LLM responses into 0-1 scores with explanations
- Add LLM judge exports to main API

### Success Criteria

#### Automated Verification
- [ ] Build passes with LLM scorer types
- [ ] Can import LLM scorers from package

#### Manual Verification
- [ ] LLM judge returns score between 0.0 and 1.0
- [ ] LLM judge provides explanation/reasoning
- [ ] If API key missing, fails gracefully with clear error
- [ ] Scorer correctly evaluates code quality based on criteria
- [ ] Different criteria produce different scores (sanity check)

### What We're NOT Doing in Phase 4

❌ Multi-dimensional rubrics
❌ Human-in-the-loop scoring
❌ Custom scorer DSL

---

## Phase 5: Polish & Publish

**Status**: ⏳ Not Started
**Goal**: Production-ready release with great DX
**Estimated Time**: 4-6 hours

### Overview

Final polish, documentation, examples, testing, and npm publishing.

### What We're Building

1. **Comprehensive README** with quickstart and API docs
2. **Multiple examples** covering common use cases
3. **Integration tests** for all major features
4. **CLI wrapper** (optional) for command-line usage
5. **npm publishing** as `claude-code-eval@0.1.0`

### Changes Required

- Write comprehensive README.md
- Create 3-5 example scripts:
  - Single prompt evaluation
  - Multi-iteration reliability test
  - A/B prompt comparison
  - LLM judge usage
  - Custom scorer example
- Write integration tests for each phase
- Package metadata updates (name, description, keywords)
- Prepare for npm publish
- GitHub repository setup (if public)

### Success Criteria

#### Automated Verification
- [ ] All tests pass: `npm test`
- [ ] Build succeeds: `npm run build`
- [ ] Package can be installed locally: `npm pack && npm install -g ./claude-code-eval-*.tgz`

#### Manual Verification
- [ ] README has clear quickstart (copy-paste works)
- [ ] All examples run without errors
- [ ] API documentation is complete
- [ ] Package published to npm
- [ ] Can install from npm: `npm install claude-code-eval`
- [ ] Import works in new project: `import { runEval } from 'claude-code-eval'`

### What We're NOT Doing in Phase 5

❌ Web dashboard
❌ Hosted service
❌ Windows compatibility testing
❌ CI/CD pipeline

---

## Technical Decisions

### Package Manager Detection
**Phase 1**: Use npm only
**Phase 2+**: Detect lockfiles (package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lockb)

### Temp Directory Cleanup
**Default**: Auto-cleanup after each iteration
**Debug**: Set `EVAL_DEBUG=1` to preserve temp directories

### Timeout Handling
**Default**: 10 minutes per iteration
**Configurable**: Via `config.timeout` in milliseconds

### Error Handling
- Scorers return 0.0 on failure with error reason
- Eval continues even if one scorer fails
- Agent SDK errors are caught and reported in result

### Git Diff Capture
Assumes project is a git repository. If not:
- Initialize git in temp dir
- Create initial commit
- Capture diff against initial state

---

## Open Questions (To Resolve During Implementation)

### Phase 1
- ✅ Temp directory location: `/tmp/eval-{uuid}` (Linux/Mac) - Windows support later
- ⏳ Node modules: Skip copying (filter out) to speed up directory copy
- ⏳ If project has no build/test/lint scripts: Scorer should fail gracefully with clear message

### Phase 2
- ⏳ Parallel vs sequential iterations: Start sequential, add parallel in post-MVP
- ⏳ Max iterations limit: Cap at 10 for MVP to prevent excessive API costs

### Phase 3
- ⏳ Winner selection: Default to composite score (passRate * 0.6 + avgScore * 0.4)

### Phase 4
- ⏳ Default LLM judge model: Claude 3.5 Sonnet (Anthropic's latest)
- ⏳ Judge prompt templates: Based on Braintrust patterns

---

## References

- PRD: `cc-eval-prd.md`
- Vercel next-evals-oss: https://github.com/vercel/next-evals-oss
- Claude Agent SDK: https://docs.claude.com/en/docs/claude-code/sdk/migration-guide
- Braintrust scoring: https://www.braintrust.dev/blog/measuring-what-matters

---

**Next Step**: Begin Phase 1 implementation following the changes outlined above.

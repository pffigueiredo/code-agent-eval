# code-agent-eval

`code-agent-eval` is a TypeScript library for evaluating prompts against coding agents (Claude Code, Cursor, etc.). Test prompt reliability by running them multiple times, capturing code changes, and scoring outputs using deterministic (build/test/lint) and LLM-based evaluation patterns.

**Key Principle**: Original codebases remain UNTOUCHED. All modifications happen in isolated temporary directories that are created per-iteration and cleaned up afterwards.

## Features

- ✅ **Multi-iteration evaluations**: Run prompts multiple times to test reliability
- ✅ **Parallel execution**: Run iterations sequentially, in parallel, or with controlled concurrency
- ✅ **Isolated execution**: Each run happens in a temporary directory, your codebase stays pristine
- ✅ **Deterministic scorers**: Built-in build/test/lint validators
- ✅ **Aggregate metrics**: Pass rate, mean/min/max scores, standard deviation
- ✅ **Environment variable injection**: Static or dynamic env vars per iteration
- ✅ **Git diff capture**: See exactly what changed
- ✅ **Flexible scoring**: Write custom scorers or use built-ins
- ✅ **Results export**: Export detailed results to markdown files

## Installation

```bash
npm install code-agent-eval
# or
pnpm add code-agent-eval
# or
yarn add code-agent-eval
# or
bun add code-agent-eval
```

## Quick Start

```typescript
import { runClaudeCodeEval, scorers } from 'code-agent-eval';

// Sequential execution (default)
const result = await runClaudeCodeEval({
  name: 'add-feature',
  prompts: [{ id: 'v1', prompt: 'Add a health check endpoint' }],
  projectDir: './my-app',
  iterations: 5,
  scorers: [scorers.buildSuccess(), scorers.testSuccess()],
});

console.log(`Pass rate: ${result.aggregateScores._overall.passRate * 100}%`);

// Parallel execution
const parallelResult = await runClaudeCodeEval({
  name: 'add-feature',
  prompts: [{ id: 'v1', prompt: 'Add a health check endpoint' }],
  projectDir: './my-app',
  iterations: 10,
  execution: { mode: 'parallel' }, // Run all 10 iterations concurrently
  scorers: [scorers.buildSuccess(), scorers.testSuccess()],
});

// Parallel with controlled concurrency
const limitedResult = await runClaudeCodeEval({
  name: 'add-feature',
  prompts: [{ id: 'v1', prompt: 'Add a health check endpoint' }],
  projectDir: './my-app',
  iterations: 20,
  execution: { mode: 'parallel-limit', concurrency: 3 }, // Max 3 concurrent iterations
  scorers: [scorers.buildSuccess(), scorers.testSuccess()],
});
```

## Development

- Install dependencies:

```bash
npm install
```

- Run the unit tests:

```bash
npm run test
```

- Build the library:

```bash
npm run build
```

- Run examples:

```bash
npx tsx examples/phase1-single-run.ts
npx tsx examples/phase2-multi-iteration.ts
npx tsx examples/parallel-execution.ts
npx tsx examples/results-export.ts
```

## Documentation

See [CLAUDE.md](./CLAUDE.md) for detailed architecture and development guide.

## Requirements

- Node.js 18+
- Claude Code login in the host machine

## License

MIT

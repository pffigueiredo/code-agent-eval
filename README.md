# cc-eval

`cc-eval` (Claude Code Eval Library) is a TypeScript library for testing AI integration prompts against real codebases using Claude Code Agent SDK. The library enables developers to validate prompt reliability by running them multiple times, capturing code changes, and scoring outputs using both deterministic (build/test/lint) and LLM-based evaluation patterns.

**Key Principle**: Original codebases remain UNTOUCHED. All Claude Code modifications happen in isolated temporary directories that are created per-iteration and cleaned up afterwards.

## Features

- ✅ **Multi-iteration evaluations**: Run prompts multiple times to test reliability
- ✅ **Isolated execution**: Each run happens in a temporary directory, your codebase stays pristine
- ✅ **Deterministic scorers**: Built-in build/test/lint validators
- ✅ **Aggregate metrics**: Pass rate, mean/min/max scores, standard deviation
- ✅ **Environment variable injection**: Static or dynamic env vars per iteration
- ✅ **Git diff capture**: See exactly what changed
- ✅ **Flexible scoring**: Write custom scorers or use built-ins

## Installation

```bash
npm install cc-eval
# or
pnpm add cc-eval
# or
yarn add cc-eval
# or
bun add cc-eval
```

## Quick Start

```typescript
import { runClaudeCodeEval, scorers } from 'cc-eval';

const result = await runClaudeCodeEval({
  name: 'add-feature',
  prompt: 'Add a health check endpoint',
  projectDir: './my-app',
  scorers: [scorers.buildSuccess(), scorers.testSuccess()],
}, 5); // Run 5 iterations

console.log(`Pass rate: ${result.aggregateScores._overall.passRate * 100}%`);
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
```

## Documentation

See [CLAUDE.md](./CLAUDE.md) for detailed architecture and development guide.

## Requirements

- Node.js 18+
- `ANTHROPIC_API_KEY` environment variable

## License

MIT

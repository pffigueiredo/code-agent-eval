# code-agent-eval

[![npm version](https://badge.fury.io/js/code-agent-eval.svg)](https://www.npmjs.com/package/code-agent-eval)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

Evaluate coding agent prompts (Claude Code, Cursor, etc.) by running them multiple times and scoring outputs. Test reliability, capture changes, measure success rates.

> **Key Principle**: Your codebase stays untouched. All modifications happen in isolated temp directories.

## Features

- 🔄 Multi-iteration runs with aggregate metrics (pass rate, mean/min/max, std dev)
- ⚡ Sequential, parallel, or rate-limited execution
- 🔒 Isolated temp directories per iteration
- ✅ Built-in scorers (build/test/lint) + custom scorer support
- 📊 Git diff capture + markdown results export
- 🔧 Environment variable injection (static/dynamic)

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

const result = await runClaudeCodeEval({
  name: 'add-feature',
  prompts: [{ id: 'v1', prompt: 'Add a health check endpoint' }],
  projectDir: './my-app',
  iterations: 10,
  execution: { mode: 'parallel' }, // or 'sequential' (default), 'parallel-limit'
  scorers: [scorers.buildSuccess(), scorers.testSuccess()],
});

console.log(`Pass rate: ${result.aggregateScores._overall.passRate * 100}%`);
```

## Development

```bash
npm install              # Install dependencies
npm run build            # Build library
npm run test             # Run tests

# Examples
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

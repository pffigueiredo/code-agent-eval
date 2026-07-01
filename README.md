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
- ✅ Built-in scorers (build/test/lint), `skillPickedUp` for Skill invocations, plus custom scorers
- 📊 Git diff capture; with `resultsDir`, exports `results.md`, per-iteration logs, and `results.json`
- 🔧 Environment variable injection (static/dynamic)
- 🖥️ CLI (`code-agent-eval`) to run evals from a config file (`--eval-file`)

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

## CLI

Run an eval from a file that exports a default (or named `config`) `EvalConfig`:

```bash
npx code-agent-eval --eval-file ./examples/cli-test.ts
```

After `npm install -g code-agent-eval`, use `code-agent-eval` instead of `npx`. See `code-agent-eval --help` for every flag.

Eval files loaded via `--eval-file` may use `import { scorers, … } from 'code-agent-eval'`. The CLI resolves that specifier to the same package as the running binary, so **`npx` works without installing `code-agent-eval` in the project** (no local `node_modules` entry required for those imports).

Useful options: `--json` (results on stdout), `--dry-run` (validate config and print plan), `--show-skill` (print eval/skill guide), `--iterations`, `--verbose`, `--results-dir`. Env vars `CODE_AGENT_EVAL_ITERATIONS`, `CODE_AGENT_EVAL_VERBOSE`, `CODE_AGENT_EVAL_RESULTS_DIR` override config when set.

When the process runs inside an agentic environment, JSON-style stdout may be selected automatically; use `--no-agent-detect` or `CODE_AGENT_EVAL_AGENT_DETECT=0` to disable.

## Development

```bash
npm install              # Install dependencies
npm run typecheck        # TypeScript check
npm run build            # Build library
npm run test             # Run tests

# Examples
npx tsx examples/phase1-single-run.ts
npx tsx examples/phase2-multi-iteration.ts
npx tsx examples/parallel-execution.ts
npx tsx examples/multi-prompt-parallel.ts
npx tsx examples/results-export.ts
npx tsx examples/plugin-execution.ts
npx code-agent-eval --eval-file ./examples/cli-test.ts
```

## Releasing

Releases are cut from a PR and published by CI. From an up-to-date `main`:

```bash
npm run release:prepare   # bumpp picks the version, creates release/<version>, changelogen writes the CHANGELOG section
# review the CHANGELOG diff, then commit + open a PR
```

`release:prepare` bumps the version, creates the `release/<version>` branch for you, and
writes the CHANGELOG section — no need to create the branch by hand.

On merge to `main`, `.github/workflows/release.yml` sees the new version has no matching
tag, then tags `vX.Y.Z`, publishes to npm (with provenance), and creates a GitHub Release
from the CHANGELOG section. Prereleases (e.g. `-alpha.0`) publish under a matching dist-tag,
not `latest`.

> One-time setup: enable npm [Trusted Publishing (OIDC)](https://docs.npmjs.com/trusted-publishers)
> for this package so CI can publish without an `NPM_TOKEN`.

## Documentation

See [CLAUDE.md](./CLAUDE.md) for agent context; expanded architecture, config, and scorer examples are in [docs/claude/](docs/claude/).

## Requirements

- Node.js 18+
- `ANTHROPIC_API_KEY` for the Claude Agent SDK
- Claude Code available on the host (CLI auth / environment expected for agent runs)

## License

MIT

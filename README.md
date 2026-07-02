# code-agent-eval

[![npm version](https://badge.fury.io/js/code-agent-eval.svg)](https://www.npmjs.com/package/code-agent-eval)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

Evaluate coding agent prompts (Claude Code, Cursor, etc.) by running them multiple times and scoring outputs.
Test reliability, capture diffs, measure success rates.

> **Key Principle**: Your codebase stays untouched. All modifications happen in isolated temp directories.

---

## For agents: write a JSON eval

The fastest path — no TypeScript, no build step. Get the schema:

```bash
npx code-agent-eval --print-schema
```

In your `eval.json`, set `"$schema": "https://unpkg.com/code-agent-eval/schema.json"` (not the URL printed inside the schema output) so editors bind autocomplete + validation:

```json
{
  "$schema": "https://unpkg.com/code-agent-eval/schema.json",
  "name": "add-health-endpoint",
  "prompts": [
    { "id": "v1", "prompt": "Add a /health endpoint that returns { status: \"ok\" }" }
  ],
  "projectDir": ".",
  "iterations": 3,
  "scorers": [
    { "type": "build" },
    { "type": "test" },
    { "type": "file", "path": "src/routes/health.ts", "exists": true },
    { "type": "diff-contains", "pattern": "health\\.ts", "expect": "present" }
  ]
}
```

Validate then run:

```bash
npx code-agent-eval --eval-file eval.json --dry-run   # catches errors before any agent runs
npx code-agent-eval --eval-file eval.json --json      # structured output
```

**Scorer types:** `build` · `test` · `lint` · `command` · `file` · `diff-contains` · `skill-picked-up` · `all` · `any` · `script`

See `npx code-agent-eval --show-skill` for the full scorer reference.

---

## For CI: JSON + CLI

Pipe results to your pipeline with `--json` (stdout) and check exit codes:

```bash
# exit 0 = all pass, exit 1 = some fail, exit 78 = config error
npx code-agent-eval --eval-file eval.json --json > results.json
echo "exit=$?"
```

Useful flags:

flag|purpose
`--dry-run`|validate config + print plan; never runs the agent
`--json`|structured results on stdout; logs on stderr
`--print-schema`|emit the JSON Schema (pipe to a file for offline use)
`--iterations <n>`|override iteration count
`--results-dir <path>`|write `results.md`, `results.json`, `iteration-*.log`
`--no-agent-detect`|force human-readable output even inside a coding agent env

Environment variable overrides: `CODE_AGENT_EVAL_ITERATIONS`, `CODE_AGENT_EVAL_VERBOSE`, `CODE_AGENT_EVAL_RESULTS_DIR`, `CODE_AGENT_EVAL_AGENT_DETECT=0`.

**JSON output shape:**

```json
{ "status": "ok", "agentDetection": {...}, "data": { "name": "...", "aggregateScores": {...}, ... } }
{ "status": "error", "agentDetection": {...}, "error": { "code": "CONFIG_INVALID", "message": "...", "fix": "...", "transient": false } }
```

Exit codes: `0` success · `1` eval failure · `2` usage error · `78` config error.

---

## For programmatic use: TypeScript API

Install:

```bash
npm install code-agent-eval
# or: pnpm add / yarn add / bun add
```

```typescript
import { runClaudeCodeEval, BuildSuccessScorer, TestSuccessScorer, SkillPickedUpScorer } from 'code-agent-eval';

const result = await runClaudeCodeEval({
  name: 'add-feature',
  prompts: [
    { id: 'minimal', prompt: 'Add a health check endpoint' },
    { id: 'detailed', prompt: 'Add a /health endpoint returning { status: "ok" } with a test' },
  ],
  projectDir: './my-app',
  iterations: 5,
  execution: { mode: 'parallel-limit', concurrency: 3 },
  scorers: [
    new BuildSuccessScorer(),
    new TestSuccessScorer(),
    new SkillPickedUpScorer('read-file'),
    {
      name: 'no-console-log',
      evaluate: async ({ diff }) =>
        /^\+.*console\.log/m.test(diff)
          ? { score: 0, reason: 'console.log added' }
          : { score: 1, reason: 'clean diff' },
    },
  ],
  resultsDir: './eval-results',
});

console.log(`Pass rate: ${result.aggregateScores._overall.passRate * 100}%`);
console.log(`Tokens: ${result.tokenUsage.totalTokens}`);
```

Built-in scorer classes: `BuildSuccessScorer` · `TestSuccessScorer` · `LintSuccessScorer` · `SkillPickedUpScorer` · `FileScorer` · `DiffContainsScorer`. Extend `BaseScorer` for custom scorers.

**Eval file shortcut** — run a `.ts`/`.js` config with the CLI (no separate compile step):

```bash
npx code-agent-eval --eval-file ./eval.config.ts
```

The CLI resolves `import { ... } from 'code-agent-eval'` to its own copy — no local install needed.

---

## Requirements

- Node.js 18+
- `ANTHROPIC_API_KEY` for the Claude Agent SDK
- Claude Code available on the host (CLI auth / environment expected for agent runs)

## Installation

```bash
npm install code-agent-eval    # local
npm install -g code-agent-eval # global — then use `code-agent-eval` instead of `npx code-agent-eval`
```

## Development

```bash
pnpm install              # install deps
pnpm run typecheck        # TypeScript check
pnpm run build            # build + generate schema.json
pnpm run test             # unit + integration tests

# Examples
pnpm dlx tsx examples/phase1-single-run.ts
pnpm dlx tsx examples/phase2-multi-iteration.ts
node dist/cli.mjs --eval-file ./examples/eval.json --dry-run   # after pnpm run build
```

### Security audit escape hatch

CI runs `pnpm audit --prod --audit-level high` as a blocking gate. If a high+ advisory lands in a
transitive production dependency with no fixed release yet, scope an escape hatch to that single
advisory (never a blanket `--audit-level` bump or disable) and remove it once a fix ships:

- prefer a `pnpm.overrides` bump to a patched version of the offending transitive package, or
- if no fix exists, ignore only that advisory via `pnpm.auditConfig.ignoreCves` in `package.json`
  (e.g. `"pnpm": { "auditConfig": { "ignoreCves": ["CVE-2025-XXXXX"] } }`).

## Releasing

From an up-to-date `main`:

```bash
pnpm run release:prepare   # bump version, create release branch, write CHANGELOG
# review CHANGELOG diff, then commit + open a PR
```

On merge to `main`, CI tags `vX.Y.Z`, publishes to npm, and creates a GitHub Release.

## Documentation

- `CLAUDE.md` — agent context and quick reference
- `docs/claude/` — architecture, config, scorer patterns
- `npx code-agent-eval --show-skill` — full scorer and config reference (also printed by `--show-skill`)

## License

MIT

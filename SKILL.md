---
name: code-agent-eval
description: >
  Generate eval config files for the `code-agent-eval` library, which runs prompts against coding agents
  (Claude Code, Cursor, etc.), captures diffs, and scores results with deterministic and LLM-based scorers.
  Use this skill whenever the user wants to evaluate, benchmark, or test a coding agent's performance on a
  codebase — including creating eval configs, writing scorers, comparing prompt variants, or running evals
  via CLI or programmatic API. Also trigger when the user mentions "eval", "agent evaluation", "prompt
  comparison", "coding agent testing", "agent benchmark", or wants to measure how well an AI coding
  assistant handles a task.
---

# code-agent-eval

Evaluate coding agents by authoring a **JSON config** — no TypeScript or build step required. The config
is validated against a published JSON Schema; `--dry-run` catches mistakes before any agent runs.

## Quick start (JSON-first)

Get the schema (for editor autocomplete + validation):

```bash
npx code-agent-eval --print-schema > schema.json
```

Or reference the published schema directly with `$schema`:

```json
{ "$schema": "https://unpkg.com/code-agent-eval/schema.json" }
```

Write an `eval.json`, validate it, then run:

```bash
npx code-agent-eval --eval-file eval.json --dry-run   # validate — no agent runs
npx code-agent-eval --eval-file eval.json             # real run
npx code-agent-eval --eval-file eval.json --json      # structured output for CI
```

## Eval config format

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
    { "type": "file", "path": "src/routes/health.ts", "exists": true, "contains": "status" },
    { "type": "diff-contains", "pattern": "health\\.ts", "expect": "present" },
    { "type": "skill-picked-up", "skill": "read-file" }
  ]
}
```

**All top-level fields:**

field|type|default|notes
`name`|string|required|identifies the eval in results
`prompts`|`[{id, prompt}]`|required|array — one entry per prompt variant
`projectDir`|string|required|source repo (copied to temp dir; never modified)
`iterations`|number|1|runs per prompt
`execution`|`{mode, concurrency?}`|sequential|`sequential` / `parallel` / `parallel-limit`
`timeout`|number|600000|per-iteration ms
`scorers`|scorer spec array|`[]`|see below
`verbose`|boolean|false|show SDK logs
`tempDirCleanup`|`always\|on-failure\|never`|`always`|temp dir retention
`resultsDir`|string|—|auto-export `results.md`, `results.json`, `iteration-*.log`
`installDependencies`|boolean|true|auto-detect npm/yarn/pnpm/bun from lock file
`agentId`|string|`"claude-code"`|appears in results
`claudeCodeOptions`|object|—|passed to Claude Agent SDK `query()`
`environmentVariables`|`Record<string,string>`|—|injected into agent env (JSON path only; use `.ts` for dynamic fn)

## Scorer types

### Built-in commands

```json
{ "type": "build" }
{ "type": "test" }
{ "type": "lint" }
```

Runs `npm run build/test/lint` in the agent's temp working directory.

### Custom command

```json
{
  "type": "command",
  "name": "typecheck",
  "command": "npm",
  "args": ["run", "typecheck"],
  "timeout": 60000
}
```

`name` required. `command` + `args` are passed to `execa`. If the process prints `{"score":0.7,"reason":"..."}` on stdout, that fractional score is used instead of exit-code 0/1.

### File check

```json
{
  "type": "file",
  "path": "src/routes/health.ts",
  "exists": true,
  "contains": "status: \"ok\"",
  "matches": "export (default|function)"
}
```

Checks a file inside the agent's working dir. At least one of `exists`/`contains`/`matches`/`jsonPath` required. All sub-checks are ANDed. Auto-name: `file:<path>`.

`jsonPath` checks a dotted path in a JSON file:

```json
{ "type": "file", "path": "package.json", "jsonPath": { "path": "scripts.build", "equals": "tsdown" } }
```

### Diff contains / absent

```json
{ "type": "diff-contains", "pattern": "\\+\\+\\+ b/src/routes/health\\.ts", "expect": "present" }
{ "type": "diff-contains", "pattern": "console\\.log", "expect": "absent" }
```

Regex over the full `git diff`. `expect` defaults to `"present"`. Auto-name: `diff:<pattern>`.

### Skill picked up

```json
{ "type": "skill-picked-up", "skill": "read-file" }
```

Passes if the agent invoked the named skill during its run. Auto-name: `skill-picked-up:<skill>`.

### Combinators

```json
{
  "type": "all",
  "name": "quality-gate",
  "of": [
    { "type": "build" },
    { "type": "file", "path": "README.md", "exists": true }
  ]
}
```

`all` = min score of children; `any` = max score of children. Both can be nested.

### Script (custom code escape hatch)

```json
{ "type": "script", "name": "route-coverage", "path": "./scorers/route-test-coverage.mjs" }
```

Imports `path` (relative to the eval file) and calls its `default` export as `evaluate(ctx)`. `--dry-run` imports the module and asserts a callable default — never invokes `evaluate`.

```javascript
// scorers/route-test-coverage.mjs
export default async function evaluate(ctx) {
  const result = await ctx.execCommand({ command: 'npm', args: ['test'] });
  return result;
}
```

### LLM-as-judge

For subjective criteria a command can't check (instruction-following, code quality, style), score with an **LLM judge**. Select a built-in by name:

```json
{ "type": "llm-classifier", "spec": "InstructionFollowing" }
```

Built-in names: `InstructionFollowing`, `CodeQuality`, `Security`. Or author a custom rubric inline:

```json
{
  "type": "llm-classifier",
  "spec": {
    "name": "llm:added-tests",
    "instructions": "Did the agent add meaningful test coverage?\nTask:\n{{prompt}}\nDiff:\n{{diff}}",
    "choices": [
      { "label": "A", "description": "Added tests that exercise the new behavior", "score": 1 },
      { "label": "B", "description": "Added only trivial tests", "score": 0.5 },
      { "label": "C", "description": "Added no tests", "score": 0 }
    ],
    "passThreshold": 0.5
  }
}
```

The judge picks exactly one label; its `score` becomes the scorer's score. `instructions` may reference `{{prompt}}`, `{{diff}}`, `{{finalText}}`, `{{agentOutput}}`. Needs `ANTHROPIC_API_KEY`. On an infra fault or unparseable verdict the scorer degrades to `score: 0` rather than throwing.

## Scorer interface

The `ScorerContext` passed to every scorer:

```typescript
interface ScorerContext {
  workingDir: string;        // temp dir with agent's changes
  diff: string;              // full git diff
  agentOutput: string;       // raw agent messages (JSON)
  promptId: string;          // which prompt variant
  prompt: string;            // the prompt text given to the agent
  execCommand: (opts: ExecCommandOptions) => Promise<ScorerResult>;
}

interface ExecCommandOptions {
  command: string;           // e.g. 'npm'
  args: string[];            // e.g. ['run', 'test']
  timeout?: number;          // ms (default 120000)
  successMessage?: string;
  failureMessage?: string;
}

interface ScorerResult {
  score: number;             // 0.0–1.0
  reason: string;
  metadata?: Record<string, unknown>;
  passThreshold?: number;    // pass when score >= passThreshold (default 1.0)
}
```

## Four escape-hatch rungs

When JSON scorers aren't enough, escalate:

1. **JSON** (`type: build|test|lint|command|file|diff-contains|skill-picked-up|llm-classifier|all|any`) — zero code
2. **`script`** — a `.mjs` file with `export default async function evaluate(ctx)` — full JS, no build step
3. **`.ts`/`.js` eval file** — `export default { ..., scorers: [new BuildSuccessScorer(), ...] }` — TypeScript, built-in classes
4. **Programmatic API** — `import { runClaudeCodeEval } from 'code-agent-eval'` — full control

## CLI options

```
code-agent-eval --eval-file <path> [options]

Options:
  --eval-file <path>     Required. Path to eval config (.json/.ts/.js/.mjs)
  --dry-run              Validate config and show execution plan without running
  --print-schema         Print the JSON Schema for eval.json and exit
  --show-skill           Print this guide and exit
  --json                 Output results as JSON to stdout (logs go to stderr)
  --iterations <n>       Override config iterations
  --threshold <0..1>     Pass when overall pass rate >= this (default 1.0)
  --output <path>        Write an artifact; repeatable; format from extension
                         (.xml → JUnit, .json → JSON, .md → Markdown)
  --verbose              Force verbose logging
  --results-dir <path>   Override results directory
  --no-agent-detect      Disable auto-JSON when running inside a coding agent
  --help                 Show help
  --version              Show version

Environment variable overrides (flags take precedence):
  CODE_AGENT_EVAL_ITERATIONS      Override iteration count
  CODE_AGENT_EVAL_THRESHOLD       Override pass-rate threshold (0..1)
  CODE_AGENT_EVAL_VERBOSE         Set to "1" or "true" for verbose
  CODE_AGENT_EVAL_RESULTS_DIR     Override results directory
  CODE_AGENT_EVAL_AGENT_DETECT    Set to "0" to disable agent detection
```

**Precedence:** CLI flags > environment variables > config file values.

**CI:** exit codes are `0` pass / `1` fail (pass rate vs `--threshold`) / `2` usage / `69` missing `ANTHROPIC_API_KEY` / `78` config error. `--output results.junit.xml` writes JUnit for test dashboards; when `$GITHUB_STEP_SUMMARY` is set the CLI appends a Markdown summary automatically. See `examples/github-actions.yml`.

## `projectDir` and where files live

- **Eval config files** — keep them next to the real project (e.g. `evals/my-eval.json`).
- **`projectDir` = real codebase** — use `.` (relative to cwd) or an absolute path. Never modify it; the library copies it to an isolated temp dir.
- **`projectDir` = synthetic fixture** — create under `os.tmpdir()` to avoid leaving long-lived junk.

The original `projectDir` is never modified. All agent work happens in `/tmp/eval-{uuid}` sandboxes.

## Claude Code artifacts in the fixture

Put `CLAUDE.md`, skills, slash commands, and hooks inside `projectDir`. The library copies the whole tree into each temp sandbox; the agent sees the same layout as a normal checkout (`settingSources: ['project']`).

- Do not assume user-global `~/.claude` exists — breaks CI.
- `claudeCodeOptions.settingSources` overrides the default if needed.

## Key behaviors

- Temp dirs cleaned up after each run (`tempDirCleanup: 'always'` default)
- Dependencies auto-installed per run unless `installDependencies: false`
- Git repo initialized automatically if `projectDir` is not already a repo
- `--json` sends structured results to stdout; all logs go to stderr — safe for piping
- Exit code: 0 if all iterations pass, 1 if any fail, 78 on config error, 2 on usage error

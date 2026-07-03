# Config and usage

Related: docs/claude/scorers.md (scorer patterns), docs/claude/architecture-and-agent.md (workflow, SDK, temp dirs).

## EvalConfig Options

```typescript
{
  name: string;                        // Eval name
  prompts: Array<{                     // Array of prompt variants
    id: string;                        // Unique identifier
    prompt: string;                    // Prompt text
  }>;
  projectDir: string;                  // Source project path
  iterations?: number;                 // Default: 1 (per prompt)
  execution?: ExecutionConfig;         // Default: { mode: 'sequential' }
  timeout?: number;                    // Per-iteration deadline (ms). Default: 600000 (10 min)
  scorers?: Scorer[];                  // Default: []
  passThreshold?: number;              // 0..1; CLI exit 0 when _overall.passRate >= this. Default: 1.0
  verbose?: boolean;                   // Default: false (show SDK logs)
  tempDirCleanup?: TempDirCleanup;     // Default: 'always' ('always' | 'on-failure' | 'never')
  resultsDir?: string;                 // Optional: export results to dir
  installDependencies?: boolean;       // Default: true
  environmentVariables?: Record<string, string> | (context) => Record<string, string> | Promise<...>;
  claudeCodeOptions?: Record<string, unknown>; // Passthrough to Claude Agent SDK query() (plugins, systemPrompt, settingSources, …)
}
```

**Breaking Change (v2.0)**: `prompt: string` replaced with `prompts: Array<{id, prompt}>`. Single-prompt evals now use array of 1.

**Execution modes**:
- `sequential`: One at a time (default)
- `parallel`: All iterations concurrently
- `parallel-limit`: Controlled concurrency (requires `concurrency` param)

## Fixture-scoped Claude Code artifacts

For reproducible evals, put anything Claude Code should pick up **from the project tree** inside `projectDir` before the run. Examples:

- `CLAUDE.md` or `.claude/CLAUDE.md`
- `.claude/skills/`, `.claude/commands/`, hooks, subagents, and other shared `.claude/` config (as your team uses them)

The runner copies `projectDir` into an isolated temp directory and invokes the Agent SDK with `cwd` set to that copy. By default it passes `settingSources: ['project']`, so project-scoped settings and artifacts load from the copy — same idea as a normal checkout.

Do **not** rely on user-global `~/.claude` for eval prerequisites unless you explicitly want machine-specific behavior; use `claudeCodeOptions.settingSources` (e.g. include `'user'`) only when that is intentional.

This npm package’s root `SKILL.md` is agent-facing documentation for **using** `code-agent-eval` (see `--show-skill`); it is **not** copied into eval sandboxes automatically.

Local Claude Code **plugins** remain an SDK concern: pass `claudeCodeOptions.plugins` with a path to the plugin on disk when you need them (often machine-specific); fixture-scoped `.claude/` content is still the default story for team-shared agent context.

## Results Export

Set `resultsDir` in config to auto-export results:

```typescript
import { runClaudeCodeEval, BuildSuccessScorer, TestSuccessScorer } from 'code-agent-eval';

const result = await runClaudeCodeEval({
  name: 'add-feature',
  prompts: [{ id: 'v1', prompt: 'Add health check endpoint' }],
  projectDir: './my-app',
  iterations: 10,
  scorers: [new BuildSuccessScorer(), new TestSuccessScorer()],
  resultsDir: './eval-results', // Creates: eval-results/add-feature-YYYY-MM-DD-HHMMSS/
});
```

**Directory structure**:
```
eval-results/add-feature-2025-01-15-143022/
├── results.md          # Aggregate results
├── iteration-0.log     # Full agent output
├── iteration-1.log
└── ...
```

Manual export:
```typescript
import { formatResultsAsMarkdown, writeResults } from 'code-agent-eval';

const markdown = formatResultsAsMarkdown(result);
const dirPath = await writeResults(result, './custom-dir');
```

## CI artifacts & exit codes

The CLI is built to gate CI. All of the following are additive — omit the flags and behavior matches earlier versions (`result.success ? 0 : 1`).

**Pass-rate gate** — `--threshold <0..1>` / `CODE_AGENT_EVAL_THRESHOLD` / `passThreshold` in config. The CLI exits `0` when `aggregateScores._overall.passRate >= threshold`, else `1`. Default `1.0` (all iterations must pass). `--dry-run` prints the resolved threshold in the plan.

**Artifact export** — `--output <path>`, repeatable, format inferred from the extension:

| Extension | Formatter | Shape |
| --------- | --------- | ----- |
| `.xml` (incl. `.junit.xml`) | `formatResultsAsJUnit` | `<testsuites>` → one `<testsuite>` per prompt, one `<testcase>` per iteration; failed iteration → `<failure>` with failing-scorer names + reasons |
| `.json` | `formatResultsAsJson` | full `EvalResult` (same as `--json` stdout) |
| `.md` | `formatResultsAsMarkdown` | human-readable report |

Unknown extension → exit `2`. Paths are validated up front (before the run burns time). Writing happens in the CLI; the library return value is untouched.

**GitHub job summary** — when `$GITHUB_STEP_SUMMARY` is set (always true on GitHub Actions), the CLI appends a Markdown pass/fail summary via `formatResultsAsGitHubSummary`. No tokens, no API calls, appends (never overwrites).

**Exit codes** (`sysexits.h`):

| Code | Meaning |
| ---- | ------- |
| `0`  | Pass (rate ≥ threshold) |
| `1`  | Fail (rate < threshold) |
| `2`  | Usage error (bad arg / unknown `--output` extension) |
| `69` | `ANTHROPIC_API_KEY` missing — fail-fast preflight before any iteration; skipped for `--dry-run`/`--help`/`--version`/`--show-skill` |
| `78` | Config error (eval file failed to load) |

All formatters (`formatResultsAsJUnit`, `formatResultsAsJson`, `formatResultsAsGitHubSummary`, `formatResultsAsMarkdown`) are exported for programmatic use. A copy-paste CI workflow lives in `examples/github-actions.yml`.

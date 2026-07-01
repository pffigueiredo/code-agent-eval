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
  timeout?: number;                    // Default: 5 min
  scorers?: Scorer[];                  // Default: []
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

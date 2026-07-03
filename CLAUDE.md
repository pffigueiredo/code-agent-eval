# CLAUDE.md

In all interactions and commit messages, be extremely concise and sacrifice grammar for the sake of concision.

## Project

`code-agent-eval`: TypeScript library — run prompts against coding agents (Claude Code, Cursor, …), capture diffs, score with deterministic and LLM scorers.

**Invariant:** The repo in `projectDir` is never modified; all agent work happens in isolated temp dirs. See docs/claude/architecture-and-agent.md.

## Commands

command|purpose
pnpm install|install deps
pnpm run build|build library
pnpm run dev|watch mode
pnpm run test|unit tests
pnpm run typecheck|TypeScript check
pnpm run release:prepare|bump version + write CHANGELOG for a release PR (see Releasing)
pnpm dlx tsx examples/phase1-single-run.ts|single-run example
pnpm dlx tsx examples/phase2-multi-iteration.ts|multi-iteration example
pnpm dlx tsx examples/parallel-execution.ts|parallel execution
pnpm dlx tsx examples/multi-prompt-parallel.ts|multi-prompt parallel
pnpm dlx tsx examples/results-export.ts|results export example
pnpm dlx tsx examples/plugin-execution.ts|plugin example

## Where to edit

- `src/runner.ts` — `runClaudeCodeEval()`, `runSingleIteration()`
- `src/types.ts` — `EvalConfig`, `EvalResult`, `Scorer`, etc.
- `src/index.ts` — public exports
- `src/scorers/` — `BaseScorer` abstract class + built-in scorer classes
- `src/scorers/schema.ts` — `jsonConfigSchema` (JSON path); internal `scorerSpecSchema` (discriminated union) + `baseConfigShape`
- `src/scorers/registry.ts` — `compileScorer(spec)` — spec → `Scorer` instance

## Must-know

- **v2.0:** Config uses `prompts: Array<{ id, prompt }>`, not a single `prompt` string (one prompt ⇒ array of one).
- **JSON format:** Agents should author `eval.json` with `$schema: "https://unpkg.com/code-agent-eval/schema.json"`. Scorer types: `build|test|lint|command|file|diff-contains|skill-picked-up|all|any|script`. Get schema with `--print-schema`; validate with `--dry-run`.
- **Schema split:** `evalConfigSchema` = TS path (allows function scorers); `jsonConfigSchema` = JSON path (structural union, `z.toJSONSchema`-safe). Both live in `src/scorers/schema.ts`.
- **`schema.json`:** Generated at build time (`pnpm run build` runs `scripts/gen-schema.ts`); shipped in the npm package.
- **Env:** `ANTHROPIC_API_KEY` required for the Claude Agent SDK.
- **Plugins:** Only relative paths for project files; do not leave the working directory; treat plugin absolute paths as metadata, not write targets.
- **Tests:** `pnpm run test`; suites include `tests/index.test.ts`, `tests/env-vars.test.ts`, `tests/install-deps.test.ts`, `tests/execution-modes.test.ts`, `tests/results-writer.test.ts`, `tests/base-scorer.test.ts`, `tests/agent-scorers.test.ts`, `tests/registry.test.ts`, `tests/schema-gen.test.ts`, `tests/examples.test.ts`. Integration checks: run the `pnpm dlx tsx examples/...` commands above.

## Reference (read when needed)

- Config, results export, execution modes: docs/claude/config-and-usage.md
- Scorer patterns and examples: docs/claude/scorers.md
- Workflow, temp dirs, SDK behavior, file map, status: docs/claude/architecture-and-agent.md

## Pointers

- PRD: `code-agent-eval-prd.md`
- Changelog: `CHANGELOG.md`
- Claude Agent SDK: https://platform.claude.com/docs/en/agent-sdk/typescript

## Status

Phases 1–5 done (JSON eval configs, scorer registry, script scorer, --print-schema, docs/examples). Phase 4 product roadmap (LLM judges) not done.

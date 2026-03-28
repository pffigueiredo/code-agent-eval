# CLAUDE.md

In all interactions and commit messages, be extremely concise and sacrifice grammar for the sake of concision.

## Project

`code-agent-eval`: TypeScript library — run prompts against coding agents (Claude Code, Cursor, …), capture diffs, score with deterministic and LLM scorers.

**Invariant:** The repo in `projectDir` is never modified; all agent work happens in isolated temp dirs. See docs/claude/architecture-and-agent.md.

## Commands

command|purpose
npm install|install deps
npm run build|build library
npm run dev|watch mode
npm run test|unit tests
npm run typecheck|TypeScript check
npx tsx examples/phase1-single-run.ts|single-run example
npx tsx examples/phase2-multi-iteration.ts|multi-iteration example
npx tsx examples/parallel-execution.ts|parallel execution
npx tsx examples/multi-prompt-parallel.ts|multi-prompt parallel
npx tsx examples/results-export.ts|results export example
npx tsx examples/plugin-execution.ts|plugin example

## Where to edit

- `src/runner.ts` — `runClaudeCodeEval()`, `runSingleIteration()`
- `src/types.ts` — `EvalConfig`, `EvalResult`, `Scorer`, etc.
- `src/index.ts` — public exports
- `src/scorers/` — `BaseScorer` abstract class + built-in scorer classes

## Must-know

- **v2.0:** Config uses `prompts: Array<{ id, prompt }>`, not a single `prompt` string (one prompt ⇒ array of one).
- **Env:** `ANTHROPIC_API_KEY` required for the Claude Agent SDK.
- **Plugins:** Only relative paths for project files; do not leave the working directory; treat plugin absolute paths as metadata, not write targets.
- **Tests:** `npm run test`; suites include `tests/index.test.ts`, `tests/env-vars.test.ts`, `tests/package-manager.test.ts`, `tests/execution-modes.test.ts`, `tests/results-writer.test.ts`, `tests/base-scorer.test.ts`, `tests/agent-scorers.test.ts`. Integration checks: run the `npx tsx examples/...` commands above.

## Reference (read when needed)

- Config, results export, execution modes: docs/claude/config-and-usage.md
- Scorer patterns and examples: docs/claude/scorers.md
- Workflow, temp dirs, SDK behavior, file map, status: docs/claude/architecture-and-agent.md

## Pointers

- PRD: `code-agent-eval-prd.md`
- Changelog: `CHANGELOG.md`
- Claude Agent SDK: https://platform.claude.com/docs/en/agent-sdk/typescript

## Status

Phases 1–3 done; Phase 4 (LLM judges) not done.

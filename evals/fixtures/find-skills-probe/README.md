# find-skills-probe fixture

Minimal repo whose only purpose is to be the `projectDir` for the `find-skills`
weakness eval (`evals/find-skills-weaknesses.ts`).

It ships the **real** `find-skills` SKILL.md under `.claude/skills/find-skills/`
so the Claude Agent SDK discovers it via `settingSources: ['project']` — the
eval then measures how the skill steers agent behavior on trigger prompts.

`utils.js` exists only so the "trivial task" probe (weakness A) has a real file
to act on instead of operating on an empty repo.

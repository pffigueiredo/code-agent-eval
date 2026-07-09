# Creating scorers

Related: docs/claude/config-and-usage.md (EvalConfig), docs/claude/architecture-and-agent.md (runner, scorers location).

Extend `BaseScorer` abstract class. Scorers receive `ScorerContext` with `execCommand` utility.

**Command-based scorer**:
```typescript
import { BaseScorer } from 'code-agent-eval';
import type { ScorerContext, ScorerResult } from 'code-agent-eval';

class TypecheckScorer extends BaseScorer {
  readonly name = 'typecheck';
  async evaluate({ execCommand }: ScorerContext): Promise<ScorerResult> {
    return execCommand({
      command: 'pnpm',
      args: ['typecheck'],
      timeout: 60000
    });
  }
}
```

**Custom logic scorer**:
```typescript
class DiffSizeScorer extends BaseScorer {
  readonly name = 'diff-size';
  async evaluate({ diff }: ScorerContext): Promise<ScorerResult> {
    const lines = diff.split('\n').length;
    return lines < 50
      ? { score: 1.0, reason: 'Concise (< 50 lines)' }
      : { score: 0.0, reason: `Too large (${lines} lines)` };
  }
}
```

**Agent-behavior scorer** — check if a specific skill was invoked:
```typescript
import { SkillPickedUpScorer } from 'code-agent-eval';

new SkillPickedUpScorer('commit')
```

For evals that assert on `Skill` tool use, ship the skill (and related `.claude/` context) **inside the fixture `projectDir`** so Claude Code can discover it without depending on `~/.claude`. See **Fixture-scoped Claude Code artifacts** in docs/claude/config-and-usage.md.

**Hybrid scorer** (command + logic):
```typescript
class BuildAndCheckScorer extends BaseScorer {
  readonly name = 'build-and-check';
  async evaluate({ execCommand, diff }: ScorerContext): Promise<ScorerResult> {
    const buildResult = await execCommand({
      command: 'npm',
      args: ['run', 'build'],
      timeout: 300000
    });
    if (buildResult.score === 0) return buildResult;

    if (/^\+.*console\.log/.test(diff)) {
      return { score: 0.5, reason: 'Build passed but console.log added' };
    }
    return { score: 1.0, reason: 'Build passed, no console.logs' };
  }
}
```

## LLM-as-judge (`llm-classifier`)

Scores subjective criteria a command can't check. A judge is declared as data — a `ClassifierSpec` (a question + a rubric of labelled choices) — and run by `LLMClassifierScorer`. The judge picks exactly one label; that label's `score` becomes the result. Needs `ANTHROPIC_API_KEY`.

Select a built-in by name (`InstructionFollowing`, `CodeQuality`, `Security`), or supply a custom spec:

```json
{ "type": "llm-classifier", "spec": "InstructionFollowing" }
```

```json
{
  "type": "llm-classifier",
  "spec": {
    "name": "llm:mirrors-style",
    "instructions": "Did the change follow the file's existing style?\nTask:\n{{prompt}}\n\nDiff:\n{{diff}}",
    "choices": [
      { "label": "A", "description": "Yes — matches surrounding conventions", "score": 1 },
      { "label": "B", "description": "Somewhat — minor deviations", "score": 0.6 },
      { "label": "C", "description": "No — clashes with existing style", "score": 0 }
    ],
    "passThreshold": 0.6
  }
}
```

`instructions` is the QUESTION only; it may reference `{{prompt}}`, `{{diff}}`, `{{finalText}}`, `{{agentOutput}}`. The judge runs neutral and single-turn (regex fallback if structured output is unavailable), and degrades to `score: 0` on an infra fault or unparseable verdict rather than throwing. The chosen label + description land in `metadata`.

**passThreshold** — a scorer passes when `score >= passThreshold` (default 1.0). Binary command scorers stay all-or-nothing; graded judges opt into a lower bar via `passThreshold` on the spec. This drives both the iteration's `success` and each scorer's `passRate`. `isScorePassing(result)` implements the decision.

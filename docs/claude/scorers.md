# Creating scorers

Related: docs/claude/config-and-usage.md (EvalConfig), docs/claude/architecture-and-agent.md (runner, scorers location).

Use single `createScorer()` factory. Scorers receive `ScorerContext` with `execCommand` utility.

**Command-based scorer**:
```typescript
import { createScorer } from 'code-agent-eval';

const typecheck = createScorer('typecheck', ({ execCommand }) =>
  execCommand({
    command: 'pnpm',
    args: ['typecheck'],
    timeout: 60000
  })
);
```

**Custom logic scorer**:
```typescript
const diffSize = createScorer('diff-size', async ({ diff }) => {
  const lines = diff.split('\n').length;
  return lines < 50
    ? { score: 1.0, reason: 'Concise (< 50 lines)' }
    : { score: 0.0, reason: `Too large (${lines} lines)` };
});
```

**Agent-behavior scorer** — check if a specific skill was invoked:
```typescript
// Check if the agent invoked the 'commit' skill
scorers.skillPickedUp('commit')
```

**Hybrid scorer** (command + logic):
```typescript
const buildAndCheck = createScorer('build-and-check', async ({ execCommand, diff }) => {
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
});
```

import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ScorerContext, ScorerResult } from '../src';

// Dogfood: use code-agent-eval to measure which onboarding-prompt phrasing
// best gets a fresh agent to (1) fetch the skill and (2) author a valid config.

// --- Fixture: a throwaway repo whose only job is to make `npx code-agent-eval`
// resolvable inside the sandbox. No real project under test. ---
const fixture = mkdtempSync(path.join(os.tmpdir(), 'cae-prompt-dogfood-'));
writeFileSync(
  path.join(fixture, 'package.json'),
  JSON.stringify(
    {
      name: 'cae-prompt-dogfood-fixture',
      private: true,
      version: '0.0.0',
      dependencies: { 'code-agent-eval': 'latest' },
    },
    null,
    2
  )
);

// The concrete task baked into every prompt variation — self-contained, no repo.
const TASK =
  'measure how reliably a coding agent can create a file `hello.txt` containing the word "hello"';

const variations = [
  {
    id: 'minimal',
    prompt: `Use the code-agent-eval tool to ${TASK}.

Run \`npx code-agent-eval --show-skill\` first — that's the full guide. Then write the eval config, run it, and report the pass rate.`,
  },
  {
    id: 'numbered-steps',
    prompt: `Use the code-agent-eval tool to ${TASK}.

1. Run \`npx code-agent-eval --show-skill\` and read it — the full guide for writing eval configs and scorers.
2. Write an eval config file.
3. Run it with \`npx code-agent-eval --eval-file <path>\`.
4. Report the pass rate.`,
  },
  {
    id: 'terse-pointer',
    prompt: `Learn code-agent-eval via \`npx code-agent-eval --show-skill\`, then use it to ${TASK}.`,
  },
];

// --- Scorers (deterministic, run in the sandbox where the fixture installed
// code-agent-eval) ---

function findConfig(dir: string): string | null {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const nested = findConfig(path.join(dir, entry.name));
      if (nested) return nested;
    } else if (/\.(ts|js|mjs)$/.test(entry.name) && entry.name !== 'package.json') {
      return path.join(dir, entry.name);
    }
  }
  return null;
}

const ranShowSkill = {
  name: 'ran-show-skill',
  evaluate: async ({ agentOutput }: ScorerContext): Promise<ScorerResult> => {
    const ok = /--show-skill/.test(agentOutput);
    return {
      score: ok ? 1 : 0,
      reason: ok ? 'agent invoked --show-skill' : 'never ran --show-skill',
    };
  },
};

const wroteValidConfig = {
  name: 'wrote-valid-config',
  evaluate: async ({ workingDir, execCommand }: ScorerContext): Promise<ScorerResult> => {
    const config = findConfig(workingDir);
    if (!config) return { score: 0, reason: 'no eval config file written' };
    const rel = path.relative(workingDir, config);
    return execCommand({
      command: 'npx',
      args: ['code-agent-eval', '--eval-file', rel, '--dry-run'],
      timeout: 60000,
      successMessage: `valid config: ${rel}`,
      failureMessage: `config failed --dry-run: ${rel}`,
    });
  },
};

export default {
  name: 'agent-onboarding-prompt',
  prompts: variations,
  projectDir: fixture,
  iterations: 1,
  timeout: 480000,
  execution: { mode: 'parallel-limit', concurrency: 3 },
  scorers: [ranShowSkill, wroteValidConfig],
  resultsDir: './eval-results/prompt-dogfood',
  tempDirCleanup: 'on-failure',
  claudeCodeOptions: { permissionMode: 'acceptEdits' },
};

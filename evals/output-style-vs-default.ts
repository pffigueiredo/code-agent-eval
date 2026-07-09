import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runClaudeCodeEval } from '../src';
import type { EvalConfig, ScorerContext, ScorerResult } from '../src';

/**
 * Can we drive a custom output style through the Claude Agent SDK, and eval it?
 *
 * YES — and this eval proves it two ways:
 *
 *  1. OBSERVABILITY (does the SDK honor the style?). The SDK emits a
 *     `system`/`init` message carrying `output_style` — the style actually
 *     loaded for the session. The runner records every SDK message into
 *     `agentOutput`, so `output-style-active` reads that field back and
 *     asserts it. Output styles load from PROJECT settings: the runner passes
 *     `settingSources: ['project']` and copies the fixture's `.claude/` into
 *     the sandbox, so `.claude/settings.json` ({"outputStyle": "..."}) +
 *     `.claude/output-styles/<name>.md` activate the style with NO runner
 *     changes.
 *
 *  2. BEHAVIOR (does the style change the answers?). Two arms run the SAME
 *     questions and differ ONLY by projectDir: `default/` (no style) vs
 *     `custom/` (pedro-simple-style). Deterministic scorers measure the
 *     style's own rules on the final assistant text — trailing asides, filler
 *     sign-offs, list-per-line. Comparing the two arms' scores quantifies the
 *     style's effect.
 *
 * SCORING CONVENTION: for the behavioral scorers, score 1.0 = the answer obeys
 * the pedro-simple-style rule, 0.0 = it violates it. The custom arm should
 * out-score the default arm; a bigger gap = the style bit harder. These are
 * measurements, not a pass/fail gate on the default arm.
 *
 * SANDBOX NOTE: pure Q&A — no files written, no deps needed. We set
 * `installDependencies: false` and don't lean on any tool permissions.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, 'fixtures', 'output-style-probe');

const CUSTOM_STYLE = 'pedro-simple-style';

// --- agentOutput parsing ----------------------------------------------------

function parseMessages(agentOutput: string): any[] {
  try {
    const parsed = JSON.parse(agentOutput);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** The output style the SDK loaded for the session (from `system`/`init`). */
function activeOutputStyle(messages: any[]): string | undefined {
  const init = messages.find(
    (m) => m?.type === 'system' && m?.subtype === 'init'
  );
  return init?.output_style;
}

/** Concatenated final assistant text — what the user actually reads. */
function finalText(messages: any[]): string {
  const texts: string[] = [];
  for (const msg of messages) {
    if (msg?.type !== 'assistant') continue;
    const content = msg?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') {
        texts.push(block.text);
      }
    }
  }
  return texts.join('\n');
}

function nonEmptyLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

// --- scorers ----------------------------------------------------------------

// OBSERVABILITY: proves the SDK loaded the style we asked for. The expected
// value is threaded per-arm via environment (the eval passes it), so the SAME
// scorer asserts "default" for the default arm and the custom name for the
// custom arm. This is the "can the SDK even do output styles" answer.
const outputStyleActive = {
  name: 'output-style-active',
  evaluate: async ({
    agentOutput,
    environmentVariables,
  }: ScorerContext): Promise<ScorerResult> => {
    const expected = environmentVariables?.EXPECTED_OUTPUT_STYLE ?? 'default';
    const active = activeOutputStyle(parseMessages(agentOutput));
    if (active === undefined) {
      return { score: 0, reason: 'no system/init message found in SDK output' };
    }
    return active === expected
      ? {
          score: 1,
          reason: `SDK loaded output_style="${active}"`,
          metadata: { active },
        }
      : {
          score: 0,
          reason: `expected output_style="${expected}" but SDK loaded "${active}"`,
          metadata: { active, expected },
        };
  },
};

// BEHAVIOR — trailing aside. pedro-simple-style: "End when the answer ends."
// FAIL if the last line is a set-apart closing observation.
const TRAILING_ASIDE =
  /^(one thing|one note|one small|worth (?:flagging|noting|knowing)|also worth|a note|side note|note:|as an aside|one more thing)/i;
const noTrailingAside = {
  name: 'no-trailing-aside',
  evaluate: async ({ agentOutput }: ScorerContext): Promise<ScorerResult> => {
    const lines = nonEmptyLines(finalText(parseMessages(agentOutput)));
    const last = lines[lines.length - 1] ?? '';
    return TRAILING_ASIDE.test(last)
      ? { score: 0, reason: `trailing aside: "${last.slice(0, 60)}"` }
      : { score: 1, reason: 'ends when the answer ends' };
  },
};

// BEHAVIOR — filler sign-off. pedro-simple-style: no "Anything else?" /
// "How can I help?" / "Let me know if..." social performance.
const FILLER_SIGNOFF =
  /(anything else\??|how can i help|what'?s next|let me know if|feel free to|happy to help|hope this helps)/i;
const noFillerSignoff = {
  name: 'no-filler-signoff',
  evaluate: async ({ agentOutput }: ScorerContext): Promise<ScorerResult> => {
    const lines = nonEmptyLines(finalText(parseMessages(agentOutput)));
    const tail = lines.slice(-2).join(' ');
    return FILLER_SIGNOFF.test(tail)
      ? { score: 0, reason: `filler sign-off near end: "${tail.slice(0, 60)}"` }
      : { score: 1, reason: 'no filler sign-off' };
  },
};

// BEHAVIOR — lists one item per line. pedro-simple-style: "Present lists one
// item per line by default." FAIL if the answer packs enumerations inline
// (", and ... , and ...") without ever using line-separated bullets.
const INLINE_ENUMERATION = /(?:,\s+\w[\w ]*){2,},?\s+and\s+\w/i;
const BULLET_LINE = /^\s*(?:[-*•]|\d+[.)])\s+/m;
const listsOnePerLine = {
  name: 'lists-one-per-line',
  evaluate: async ({ agentOutput }: ScorerContext): Promise<ScorerResult> => {
    const text = finalText(parseMessages(agentOutput));
    const hasBullets = BULLET_LINE.test(text);
    const hasInlineList = INLINE_ENUMERATION.test(text);
    if (!hasInlineList && !hasBullets) {
      return { score: 1, reason: 'no list to format' };
    }
    return hasBullets
      ? { score: 1, reason: 'used line-separated list items' }
      : { score: 0, reason: 'packed an enumeration inline instead of one-per-line' };
  },
};

// --- questions (identical across both arms) ---------------------------------
// Chosen to expose the style's rules: a one-liner (right-sizing), a how-to
// (invites filler sign-offs / trailing asides), and an enumerable question
// (invites inline vs one-per-line lists).
const prompts = [
  {
    id: 'oneliner',
    prompt: 'What port does HTTPS use by default?',
  },
  {
    id: 'howto',
    prompt: 'How do I undo the last git commit but keep my changes staged?',
  },
  {
    id: 'enumerate',
    prompt: 'What are the primary HTTP request methods and what is each used for?',
  },
];

const scorers = [
  outputStyleActive,
  noTrailingAside,
  noFillerSignoff,
  listsOnePerLine,
];

function arm(id: 'default' | 'custom'): EvalConfig {
  return {
    name: `output-style-${id}`,
    projectDir: path.join(fixtures, id),
    prompts,
    iterations: 3,
    execution: { mode: 'parallel-limit', concurrency: 3 },
    timeout: 180000,
    scorers,
    installDependencies: false,
    tempDirCleanup: 'on-failure',
    resultsDir: `./eval-results/output-style-${id}`,
    // The observability scorer asserts this per arm. 'default' is the SDK's
    // built-in style name when none is configured.
    environmentVariables: {
      EXPECTED_OUTPUT_STYLE: id === 'custom' ? CUSTOM_STYLE : 'default',
    },
    claudeCodeOptions: { permissionMode: 'acceptEdits' },
  };
}

async function main() {
  console.log('=== Output style via SDK: custom vs default ===\n');

  const defaultResult = await runClaudeCodeEval(arm('default'));
  const customResult = await runClaudeCodeEval(arm('custom'));

  const mean = (r: typeof defaultResult, scorer: string) =>
    r.aggregateScores[scorer]?.mean ?? 0;

  console.log('\n' + '='.repeat(64));
  console.log('COMPARISON (mean score per scorer: default -> custom)');
  console.log('='.repeat(64));
  for (const s of scorers) {
    const d = mean(defaultResult, s.name);
    const c = mean(customResult, s.name);
    const delta = c - d;
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '=';
    console.log(
      `  ${s.name.padEnd(22)} ${d.toFixed(2)} -> ${c.toFixed(2)}  ${arrow} ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`
    );
  }
  console.log('='.repeat(64));
  console.log(
    '\noutput-style-active proves the SDK loaded each arm\'s style.\n' +
      'The behavioral scorers should read higher for the custom arm.\n'
  );
}

// Run only when executed directly (e.g. `tsx evals/output-style-vs-default.ts`),
// not when imported for validation.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

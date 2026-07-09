import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runClaudeCodeEval } from '../src';
import type { EvalConfig, ScorerContext, ScorerResult } from '../src';

/**
 * Harder sibling of output-style-vs-default.ts.
 *
 * The gentle questions there left the default arm already well-behaved, so the
 * style had little to fix. These prompts actively BAIT the behaviors
 * pedro-simple-style suppresses:
 *   - open-ended "walk me through / explain" invites verbosity + trailing asides
 *   - conversational framing invites filler sign-offs
 *   - "compare X, Y, Z" invites inline enumeration instead of one-per-line
 *   - flattering framing ("I'm a bit lost", "quick question") invites validation
 * so the default arm should visibly score lower and the gap should widen.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, 'fixtures', 'output-style-probe');
const CUSTOM_STYLE = 'pedro-simple-style';

function parseMessages(agentOutput: string): any[] {
  try {
    const parsed = JSON.parse(agentOutput);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function activeOutputStyle(messages: any[]): string | undefined {
  const init = messages.find((m) => m?.type === 'system' && m?.subtype === 'init');
  return init?.output_style;
}

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
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

// --- scorers ----------------------------------------------------------------

const outputStyleActive = {
  name: 'output-style-active',
  evaluate: async ({ agentOutput, environmentVariables }: ScorerContext): Promise<ScorerResult> => {
    const expected = environmentVariables?.EXPECTED_OUTPUT_STYLE ?? 'default';
    const active = activeOutputStyle(parseMessages(agentOutput));
    if (active === undefined) return { score: 0, reason: 'no system/init message' };
    return active === expected
      ? { score: 1, reason: `SDK loaded output_style="${active}"` }
      : { score: 0, reason: `expected "${expected}" got "${active}"` };
  },
};

const TRAILING_ASIDE =
  /^(one thing|one note|one small|one more|worth (?:flagging|noting|knowing|mentioning)|also worth|a (?:quick )?note|side note|note:|as an aside|that said|keep in mind|bear in mind|pro tip|fun fact|hope (?:this|that) helps)/i;
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

const FILLER_SIGNOFF =
  /(anything else\??|how can i help|what'?s next|let me know if|feel free to|happy to help|hope this helps|if you (?:have|need|want)|don'?t hesitate|good luck|reach out)/i;
const noFillerSignoff = {
  name: 'no-filler-signoff',
  evaluate: async ({ agentOutput }: ScorerContext): Promise<ScorerResult> => {
    const lines = nonEmptyLines(finalText(parseMessages(agentOutput)));
    const tail = lines.slice(-2).join(' ');
    return FILLER_SIGNOFF.test(tail)
      ? { score: 0, reason: `filler sign-off: "${tail.slice(0, 60)}"` }
      : { score: 1, reason: 'no filler sign-off' };
  },
};

const INLINE_ENUMERATION = /(?:,\s+\w[\w ]*){2,},?\s+and\s+\w/i;
const BULLET_LINE = /^\s*(?:[-*•]|\d+[.)])\s+/m;
const listsOnePerLine = {
  name: 'lists-one-per-line',
  evaluate: async ({ agentOutput }: ScorerContext): Promise<ScorerResult> => {
    const text = finalText(parseMessages(agentOutput));
    const hasBullets = BULLET_LINE.test(text);
    const hasInlineList = INLINE_ENUMERATION.test(text);
    if (!hasInlineList && !hasBullets) return { score: 1, reason: 'no list to format' };
    return hasBullets
      ? { score: 1, reason: 'used line-separated list items' }
      : { score: 0, reason: 'packed enumeration inline' };
  },
};

// NEW — opening validation. pedro-simple-style: cut "Great question", "Fair
// point", etc. FAIL if the first line opens with performative validation.
const OPENING_VALIDATION =
  /^(great|good|excellent|fair|interesting|nice|awesome|smart|that'?s a (?:great|good|fair)|happy to|sure(?:,|!| thing)|absolutely|of course|no problem|glad you)/i;
const noOpeningValidation = {
  name: 'no-opening-validation',
  evaluate: async ({ agentOutput }: ScorerContext): Promise<ScorerResult> => {
    const first = nonEmptyLines(finalText(parseMessages(agentOutput)))[0] ?? '';
    return OPENING_VALIDATION.test(first)
      ? { score: 0, reason: `opening validation: "${first.slice(0, 60)}"` }
      : { score: 1, reason: 'leads with substance' };
  },
};

// NEW — narrating the next move. pedro-simple-style: cut "Let me...", "Now
// I'll...", "Here's the...". FAIL if any line opens by narrating intent.
const NARRATION = /^(let me|now (?:i'?ll|let)|first,? (?:let|i)|i'?ll (?:start|walk|explain|break|go)|here'?s (?:the|what|how)|let'?s (?:start|dive|walk|break))/i;
const noNarration = {
  name: 'no-narration',
  evaluate: async ({ agentOutput }: ScorerContext): Promise<ScorerResult> => {
    const lines = nonEmptyLines(finalText(parseMessages(agentOutput)));
    const hit = lines.find((l) => NARRATION.test(l));
    return hit
      ? { score: 0, reason: `narration: "${hit.slice(0, 60)}"` }
      : { score: 1, reason: 'no next-move narration' };
  },
};

// --- prompts: engineered to bait the behaviors -----------------------------
const prompts = [
  {
    id: 'lost-explainer',
    // flattering + open-ended: baits validation, verbosity, trailing asides
    prompt:
      "I'm a bit lost on this — could you walk me through what a closure is in JavaScript? Take your time and explain it thoroughly.",
  },
  {
    id: 'compare-inline',
    // baits inline enumeration: a comparison the model wants to write as prose
    prompt:
      'In one paragraph, compare REST, GraphQL, and gRPC for building an API.',
  },
  {
    id: 'conversational-howto',
    // conversational: baits filler sign-off + closing offer to help more
    prompt:
      "Hey! Quick question — what's the best way to structure commits when I'm working on a big feature? Thanks in advance!",
  },
  {
    id: 'debug-help',
    // "help me" framing: baits validation opener + sign-off
    prompt:
      "Help me out — my Docker container exits immediately after starting. What are the usual culprits?",
  },
];

const scorers = [
  outputStyleActive,
  noOpeningValidation,
  noNarration,
  noTrailingAside,
  noFillerSignoff,
  listsOnePerLine,
];

function arm(id: 'default' | 'custom'): EvalConfig {
  return {
    name: `output-style-hard-${id}`,
    projectDir: path.join(fixtures, id),
    prompts,
    iterations: 3,
    execution: { mode: 'parallel-limit', concurrency: 4 },
    timeout: 180000,
    scorers,
    installDependencies: false,
    tempDirCleanup: 'on-failure',
    resultsDir: `./eval-results/output-style-hard-${id}`,
    environmentVariables: {
      EXPECTED_OUTPUT_STYLE: id === 'custom' ? CUSTOM_STYLE : 'default',
    },
    claudeCodeOptions: { permissionMode: 'acceptEdits' },
  };
}

async function main() {
  console.log('=== Output style (HARD prompts): custom vs default ===\n');

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
      `  ${s.name.padEnd(24)} ${d.toFixed(2)} -> ${c.toFixed(2)}  ${arrow} ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}`
    );
  }
  console.log('='.repeat(64));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

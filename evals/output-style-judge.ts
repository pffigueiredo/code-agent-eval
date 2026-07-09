import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { runClaudeCodeEval } from '../src';
import type { EvalConfig, ScorerContext, ScorerResult } from '../src';

/**
 * LLM-judge sibling of output-style-hard.ts.
 *
 * The regex scorers proved two things: they nail the observable "did the SDK
 * load the style" question, and they catch BLATANT rule violations. But the
 * softer pedro-simple-style rules are GRADED, not binary — "softened the
 * validation but didn't eliminate it" is a real improvement a regex flattens to
 * 0/1, and "lists one per line" is wrong when the prompt asked for a paragraph.
 *
 * This eval adds a single LLM judge that reads the QUESTION + the ANSWER and
 * scores adherence to pedro-simple-style on a 0..1 scale per dimension, with the
 * prompt's own intent in view (so it won't penalize prose when prose was asked
 * for). It runs alongside two regex scorers on the same answers so you can see
 * where the graded judge and the binary regex disagree.
 *
 * AUTH: the judge calls the model through the SAME agent SDK `query()` the
 * runner uses, so it authenticates the same way (gateway/CLI creds) with no
 * API key. It deliberately does NOT set settingSources, so the judge itself
 * never loads pedro-simple-style — the judge stays neutral.
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

// --- the LLM judge ----------------------------------------------------------

// The four graded dimensions the regex scorers handled badly. Each is scored
// 0..1 (1 = fully obeys the pedro-simple-style rule) by the judge, WITH the
// question in view so prompt intent is respected (e.g. "in one paragraph"
// should NOT be marked down for not using one-per-line lists).
const JUDGE_SYSTEM = `You are grading a single assistant answer against a specific writing style. You are NOT grading correctness or helpfulness — only style adherence.

The style, "pedro-simple-style", has these rules:
- SUBSTANCE FIRST: no opening validation ("Great question", "Happy to", "Sure!", "Absolutely"). Lead with the answer.
- NO NARRATION: don't narrate the next move ("Let me...", "Now I'll...", "Here's the...", "First I'll walk through...").
- RIGHT-SIZED: scale length to the question. A short question gets a short answer; don't pad.
- END WHEN DONE: no trailing aside or filler sign-off ("Hope this helps", "Let me know if...", "One thing to note...", "Anything else?").

You will be given the QUESTION the user asked and the ANSWER the assistant gave. Judge the ANSWER's style with the QUESTION's intent in mind — e.g. if the user explicitly asked for one paragraph, prose is correct and must not be penalized; if the user asked to "explain thoroughly", a longer answer is appropriately sized.

Score each dimension from 0.0 to 1.0 (1.0 = fully obeys, 0.0 = clearly violates, 0.5 = partial — e.g. softened but not eliminated). Then give an overall 0.0..1.0.

Respond with ONLY a JSON object, no prose, no code fence:
{"opening_validation": n, "narration": n, "right_sizing": n, "ending": n, "overall": n, "reason": "one short sentence"}`;

interface JudgeVerdict {
  opening_validation: number;
  narration: number;
  right_sizing: number;
  ending: number;
  overall: number;
  reason: string;
}

function extractJson(text: string): any | undefined {
  // Grab the first {...} block; judges sometimes wrap it in stray text.
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[0]);
  } catch {
    return undefined;
  }
}

async function runJudge(question: string, answer: string): Promise<JudgeVerdict | undefined> {
  const prompt = `QUESTION:\n${question}\n\nANSWER:\n${answer}`;
  const result = query({
    prompt,
    options: {
      systemPrompt: JUDGE_SYSTEM,
      // Neutral judge: do NOT load the project's output style, and give it no
      // tools — this is a one-shot text judgement.
      maxTurns: 1,
      allowedTools: [],
    },
  });

  let text = '';
  for await (const message of result) {
    if (message.type === 'assistant') {
      const content = (message as any).message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === 'text') text += block.text;
        }
      }
    }
  }
  const parsed = extractJson(text);
  if (!parsed || typeof parsed.overall !== 'number') return undefined;
  return parsed as JudgeVerdict;
}

// The eval passes the prompt text per-arm via env so the scorer can show the
// judge the question. (ScorerContext carries promptId, not the prompt text.)
function questionFor(ctx: ScorerContext): string | undefined {
  const map = ctx.environmentVariables?.PROMPTS_JSON;
  if (!map) return undefined;
  try {
    return JSON.parse(map)[ctx.promptId];
  } catch {
    return undefined;
  }
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

// Binary regex opener check — kept for contrast with the graded judge.
const OPENING_VALIDATION =
  /^(great|good|excellent|fair|interesting|nice|awesome|smart|that'?s a (?:great|good|fair)|happy to|sure(?:,|!| thing)|absolutely|of course|no problem|glad you)/i;
const regexOpeningValidation = {
  name: 'regex-opening-validation',
  evaluate: async ({ agentOutput }: ScorerContext): Promise<ScorerResult> => {
    const first =
      finalText(parseMessages(agentOutput))
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)[0] ?? '';
    return OPENING_VALIDATION.test(first)
      ? { score: 0, reason: `opening validation: "${first.slice(0, 50)}"` }
      : { score: 1, reason: 'clean opener' };
  },
};

// The LLM judge, run once per answer. Reports `overall` as the score and the
// per-dimension breakdown + the judge's reason in metadata.
const llmStyleAdherence = {
  name: 'llm-style-adherence',
  evaluate: async (ctx: ScorerContext): Promise<ScorerResult> => {
    const answer = finalText(parseMessages(ctx.agentOutput)).trim();
    if (!answer) return { score: 0, reason: 'empty answer' };
    const question = questionFor(ctx) ?? '(question unavailable)';
    const verdict = await runJudge(question, answer);
    if (!verdict) return { score: 0, reason: 'judge returned no parseable verdict' };
    return {
      score: verdict.overall,
      reason: `judge: ${verdict.reason}`,
      metadata: {
        opening_validation: verdict.opening_validation,
        narration: verdict.narration,
        right_sizing: verdict.right_sizing,
        ending: verdict.ending,
      },
    };
  },
};

// --- prompts (same baiting prompts as output-style-hard.ts) -----------------
const prompts = [
  {
    id: 'lost-explainer',
    prompt:
      "I'm a bit lost on this — could you walk me through what a closure is in JavaScript? Take your time and explain it thoroughly.",
  },
  {
    id: 'compare-inline',
    prompt: 'In one paragraph, compare REST, GraphQL, and gRPC for building an API.',
  },
  {
    id: 'conversational-howto',
    prompt:
      "Hey! Quick question — what's the best way to structure commits when I'm working on a big feature? Thanks in advance!",
  },
  {
    id: 'debug-help',
    prompt:
      "Help me out — my Docker container exits immediately after starting. What are the usual culprits?",
  },
];

const PROMPTS_JSON = JSON.stringify(Object.fromEntries(prompts.map((p) => [p.id, p.prompt])));

const scorers = [outputStyleActive, regexOpeningValidation, llmStyleAdherence];

function arm(id: 'default' | 'custom'): EvalConfig {
  return {
    name: `output-style-judge-${id}`,
    projectDir: path.join(fixtures, id),
    prompts,
    iterations: 3,
    execution: { mode: 'parallel-limit', concurrency: 4 },
    timeout: 240000,
    scorers,
    installDependencies: false,
    tempDirCleanup: 'on-failure',
    resultsDir: `./eval-results/output-style-judge-${id}`,
    environmentVariables: {
      EXPECTED_OUTPUT_STYLE: id === 'custom' ? CUSTOM_STYLE : 'default',
      PROMPTS_JSON,
    },
    claudeCodeOptions: { permissionMode: 'acceptEdits' },
  };
}

async function main() {
  console.log('=== Output style (LLM judge): custom vs default ===\n');

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
  console.log(
    '\nregex-opening-validation is binary (0/1); llm-style-adherence is graded\n' +
      '(0..1) and reads the question, so it credits partial improvement and\n' +
      'does not penalize prose when the prompt asked for prose.\n'
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

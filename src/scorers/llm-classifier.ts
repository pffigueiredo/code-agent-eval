import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Choice, ClassifierSpec, ScorerContext, ScorerResult } from '../types';
import { BaseScorer } from './base';

/**
 * Template vars an author may reference in `instructions`. `expected` is reserved
 * in the contract but not populated in v1 — referencing it renders to an empty
 * string (a future reference-answer channel fills it without a breaking change).
 */
const KNOWN_VARS = ['prompt', 'diff', 'finalText', 'agentOutput', 'expected'] as const;

const VAR_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

/** Substitute `{{var}}` occurrences from `vars`; unknown/missing vars render to ''. */
function renderInstructions(instructions: string, vars: Record<string, string>): string {
  return instructions.replace(VAR_PATTERN, (_match, name: string) => vars[name] ?? '');
}

function parseMessages(agentOutput: string): unknown[] {
  try {
    const parsed = JSON.parse(agentOutput);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Concatenate the assistant text blocks across `agentOutput` messages. */
function finalTextFrom(messages: unknown[]): string {
  const texts: string[] = [];
  for (const msg of messages) {
    const m = msg as { type?: string; message?: { content?: unknown } };
    if (m?.type !== 'assistant') continue;
    const content = m.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === 'text' && typeof block.text === 'string') texts.push(block.text);
    }
  }
  return texts.join('\n');
}

/** Build the `{{var}}` substitution map from the iteration context. */
function varsFrom(ctx: ScorerContext): Record<string, string> {
  const messages = parseMessages(ctx.agentOutput);
  return {
    prompt: ctx.prompt,
    diff: ctx.diff,
    finalText: finalTextFrom(messages),
    agentOutput: ctx.agentOutput,
    expected: '',
  };
}

/** "(A) Fully — …\n(B) Mostly — …" generated from the choices. */
function renderChoiceMenu(choices: Choice[]): string {
  return choices.map((c) => `(${c.label}) ${c.description}`).join('\n');
}

/** The full judge prompt: rendered question + generated choice menu + CoT nudge. */
function buildJudgePrompt(spec: ClassifierSpec, ctx: ScorerContext): string {
  const question = renderInstructions(spec.instructions, varsFrom(ctx));
  const menu = renderChoiceMenu(spec.choices);
  const cot = spec.useCoT === false ? '' : '\nReason step by step, then give your choice.';
  return `${question}\n\nChoose ONE:\n${menu}${cot}`;
}

/** CoT-then-choose rubric: restate the task, examine per criterion, emit one label. */
function buildJudgeSystem(spec: ClassifierSpec): string {
  const labels = spec.choices.map((c) => c.label).join(', ');
  return [
    'You are a neutral grader. You judge only what the evidence shows — not what you wish had happened.',
    'Restate the task and rubric to yourself, examine the evidence against each criterion, then emit exactly one label.',
    `Valid labels: ${labels}. Choose the single label whose description best fits the evidence.`,
  ].join('\n');
}

/** { reasoning: string, choice: enum(labels) } — enum-constrains the label. */
function buildChoiceSchema(choices: Choice[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      reasoning: { type: 'string' },
      choice: { type: 'string', enum: choices.map((c) => c.label) },
    },
    required: ['choice'],
  };
}

/**
 * Structural + referential validation of an author-supplied spec. Fails fast
 * (throws) on author error, listing every problem — distinct from the runtime
 * guarded-degradation in `evaluate`, which handles the model's fallible output.
 */
function validateSpec(spec: ClassifierSpec): void {
  const problems: string[] = [];

  if (!spec.name || spec.name.trim() === '') problems.push('`name` must be a non-empty string');
  if (!spec.instructions || spec.instructions.trim() === '')
    problems.push('`instructions` must be a non-empty string');

  if (!Array.isArray(spec.choices) || spec.choices.length === 0) {
    problems.push('`choices` must be a non-empty array');
  } else {
    // Labels are matched case-insensitively at runtime, so they must be unique
    // case-insensitively too (else 'a' and 'A' would be an ambiguous pair).
    const seen = new Set<string>();
    spec.choices.forEach((choice, i) => {
      const key = choice.label?.trim().toLowerCase();
      if (!choice.label || choice.label.trim() === '')
        problems.push(`choices[${i}].label must be a non-blank string`);
      else if (seen.has(key!)) problems.push(`duplicate choice label '${choice.label}'`);
      else seen.add(key!);

      if (!choice.description || choice.description.trim() === '')
        problems.push(`choices[${i}].description must be a non-blank string`);

      if (typeof choice.score !== 'number' || Number.isNaN(choice.score))
        problems.push(`choices[${i}].score must be a number`);
      else if (choice.score < 0 || choice.score > 1)
        problems.push(`choices[${i}].score must be within 0..1 (got ${choice.score})`);
    });
  }

  if (spec.passThreshold !== undefined) {
    if (typeof spec.passThreshold !== 'number' || Number.isNaN(spec.passThreshold))
      problems.push('`passThreshold` must be a number');
    else if (spec.passThreshold < 0 || spec.passThreshold > 1)
      problems.push(`\`passThreshold\` must be within 0..1 (got ${spec.passThreshold})`);
  }

  if (typeof spec.instructions === 'string') {
    const known = new Set<string>(KNOWN_VARS);
    for (const [, name] of spec.instructions.matchAll(VAR_PATTERN)) {
      if (!known.has(name))
        problems.push(`unknown template var '{{${name}}}' (known: ${[...known].join(', ')})`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid ClassifierSpec '${spec.name || '(unnamed)'}':\n- ${problems.join('\n- ')}`);
  }
}

/**
 * Fallback extractor (no structured output): pick the label whose last mention is
 * latest in the text — a CoT judge states its verdict last.
 */
function extractChoiceFromText(text: string, choices: Choice[]): string | undefined {
  let best: { label: string; at: number } | undefined;
  for (const c of choices) {
    // Label must be followed by punctuation or end-of-string, never whitespace,
    // else the prose article "a" matches label "A". Case-insensitive per matchChoice.
    const re = new RegExp(`(?:^|[^\\w])${escapeRegExp(c.label)}(?=[^\\w\\s]|\\s*$)`, 'gi');
    let at = -1;
    for (const m of text.matchAll(re)) at = m.index;
    if (at >= 0 && (!best || at > best.at)) best = { label: c.label, at };
  }
  return best?.label;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Outcome of a judge run: a parsed `choice`, or a `failure` describing why no
 * choice was obtained. `failure: 'error'` means the judge did not complete (SDK
 * error/abort) — an infra fault, not a content verdict; `failure: 'no-choice'`
 * means it completed but emitted nothing parseable.
 */
type JudgeOutcome =
  | { choice: string; reasoning: string }
  | { failure: 'error' | 'no-choice'; detail: string };

/**
 * Run the neutral single-turn judge. Prefers native structured output
 * (`outputFormat` enum-constrained), falls back to regex on the `result` text.
 */
async function runClassifierJudge(spec: ClassifierSpec, ctx: ScorerContext): Promise<JudgeOutcome> {
  const prompt = buildJudgePrompt(spec, ctx);
  const result = query({
    prompt,
    options: {
      systemPrompt: buildJudgeSystem(spec),
      maxTurns: 1,
      allowedTools: [],
      outputFormat: { type: 'json_schema', schema: buildChoiceSchema(spec.choices) },
      ...(spec.model ? { model: spec.model } : {}),
    },
  });

  let resultText = '';
  let structured: unknown;
  let sawSuccess = false;
  let errorSubtype = '';
  for await (const message of result) {
    if (message.type !== 'result') continue;
    if (message.subtype === 'success') {
      sawSuccess = true;
      resultText = message.result ?? '';
      structured = message.structured_output;
    } else {
      errorSubtype = message.subtype;
    }
  }

  // The judge never produced a success terminal message — infra fault, not a verdict.
  if (!sawSuccess) {
    return { failure: 'error', detail: errorSubtype || 'judge did not complete' };
  }

  // Preferred path: native structured output.
  if (structured && typeof structured === 'object') {
    const s = structured as { choice?: unknown; reasoning?: unknown };
    if (typeof s.choice === 'string') {
      return { choice: s.choice, reasoning: typeof s.reasoning === 'string' ? s.reasoning : '' };
    }
  }

  // Fallback path: JSON embedded in, then a label extracted from, the result text.
  if (resultText) {
    const parsed = tryParseJson(resultText);
    if (parsed && typeof parsed.choice === 'string') {
      return {
        choice: parsed.choice,
        reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      };
    }
    const choice = extractChoiceFromText(resultText, spec.choices);
    if (choice) return { choice, reasoning: resultText };
  }

  return { failure: 'no-choice', detail: 'judge returned no parseable choice' };
}

/** Match an emitted label to a choice, tolerating surrounding whitespace and case. */
function matchChoice(label: string, choices: Choice[]): Choice | undefined {
  const exact = choices.find((c) => c.label === label);
  if (exact) return exact;
  const norm = label.trim().toLowerCase();
  return choices.find((c) => c.label.trim().toLowerCase() === norm);
}

function tryParseJson(text: string): { choice?: unknown; reasoning?: unknown } | undefined {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return undefined;
  try {
    return JSON.parse(match[0]);
  } catch {
    return undefined;
  }
}

/**
 * Runs any {@link ClassifierSpec} as an LLM-as-judge scorer: generates the judge
 * prompt from `instructions` + `choices`, runs a neutral single-turn `query()`,
 * enum-constrains the label via structured output (regex fallback), and maps the
 * chosen label to `0..1` via the matching choice's `score`. Never returns undefined.
 */
export class LLMClassifierScorer extends BaseScorer {
  readonly name: string;

  constructor(private readonly spec: ClassifierSpec) {
    super();
    validateSpec(spec);
    this.name = spec.name;
  }

  async evaluate(ctx: ScorerContext): Promise<ScorerResult> {
    const threshold =
      this.spec.passThreshold !== undefined ? { passThreshold: this.spec.passThreshold } : {};
    const outcome = await runClassifierJudge(this.spec, ctx);

    if ('failure' in outcome) {
      return {
        score: 0,
        reason: outcome.detail,
        metadata: { failure: outcome.failure, choices: this.spec.choices },
        ...threshold,
      };
    }

    const { choice, reasoning } = outcome;
    const chosen = matchChoice(choice, this.spec.choices);

    return {
      score: chosen?.score ?? 0,
      reason: chosen ? `${chosen.label} — ${chosen.description}` : `unrecognized choice '${choice}'`,
      metadata: {
        // Canonical label so consumers aggregate on a stable value; the raw
        // model output is kept when it differed (whitespace/case tolerance).
        choice: chosen?.label ?? choice,
        ...(chosen && chosen.label !== choice ? { rawChoice: choice } : {}),
        chosenDescription: chosen?.description,
        unrecognized: chosen === undefined,
        reasoning,
        choices: this.spec.choices,
      },
      ...threshold,
    };
  }
}

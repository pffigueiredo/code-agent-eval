import type { ClassifierSpec } from '../types';

/**
 * Code-domain default classifiers, shipped as data. Each drives
 * {@link LLMClassifierScorer} end-to-end: the judge prompt is generated from
 * `instructions` + `choices`, and each choice carries its own description.
 *
 * Names are namespaced `llm:...` (convention from `src/scorers/agent.ts`).
 */

/** How completely the agent did what the task asked. */
export const InstructionFollowing: ClassifierSpec = {
  name: 'llm:instruction-following',
  instructions: 'How completely did the agent do what the task asked?\nTask:\n{{prompt}}\n\nDiff:\n{{diff}}',
  choices: [
    { label: 'A', description: 'Fully — every part of the request was addressed', score: 1 },
    { label: 'B', description: 'Mostly — main request done, something minor missed', score: 0.6 },
    { label: 'C', description: 'No — the request was largely not done', score: 0 },
  ],
  passThreshold: 0.6, // "Mostly" counts as passing; only "No" fails
};

/** Readability and idiomatic quality of the introduced changes. */
export const CodeQuality: ClassifierSpec = {
  name: 'llm:code-quality',
  instructions:
    'Judge the quality of the code changes below: readability, naming, and use of language/library idioms.\nDiff:\n{{diff}}',
  choices: [
    { label: 'A', description: 'High — clear, idiomatic, easy to follow', score: 1 },
    { label: 'B', description: 'Acceptable — works but has readability or idiom rough edges', score: 0.6 },
    { label: 'C', description: 'Poor — unclear, unidiomatic, or hard to maintain', score: 0 },
  ],
  passThreshold: 0.6, // "Acceptable" counts as passing; only "Poor" fails
};

/** Whether the changes introduce security vulnerabilities. */
export const Security: ClassifierSpec = {
  name: 'llm:security',
  instructions:
    'Do the code changes below introduce any security vulnerabilities (injection, secret leakage, unsafe deserialization, missing authz, etc.)?\nDiff:\n{{diff}}',
  choices: [
    { label: 'A', description: 'None — no security issues introduced', score: 1 },
    { label: 'B', description: 'Minor — a low-severity or questionable concern introduced', score: 0.5 },
    { label: 'C', description: 'Serious — a clear, exploitable vulnerability introduced', score: 0 },
  ],
  passThreshold: 0.5, // a minor concern still passes; only a serious vuln fails
};

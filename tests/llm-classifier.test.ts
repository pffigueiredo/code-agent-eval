import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ClassifierSpec } from "../src";
import { LLMClassifierScorer } from "../src";

// Mock the SDK. `query` is driven per-test via `queueResult`.
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query }));

/**
 * Make `query` yield a single `result`/`success` message with the given
 * structured output and/or result text, and capture the args it was called with.
 */
function queueResult(opts: { structured?: unknown; result?: string }) {
	query.mockImplementation(() => {
		async function* gen() {
			yield {
				type: "result",
				subtype: "success",
				result: opts.result ?? "",
				structured_output: opts.structured,
			};
		}
		return gen();
	});
}

const validSpec: ClassifierSpec = {
	name: "llm:demo",
	instructions:
		"Did the change do what the task asked?\nTask:\n{{prompt}}\nDiff:\n{{diff}}",
	choices: [
		{ label: "A", description: "Yes, fully", score: 1 },
		{ label: "B", description: "Partially", score: 0.5 },
		{ label: "C", description: "No", score: 0 },
	],
};

const dummyContext = (over: Partial<Record<string, unknown>> = {}) =>
	({
		workingDir: "/tmp/test",
		diff: "diff --git a/x b/x",
		agentOutput: JSON.stringify([
			{
				type: "assistant",
				message: { content: [{ type: "text", text: "done" }] },
			},
		]),
		promptId: "p1",
		prompt: "refactor the parser",
		execCommand: async () => ({ score: 0, reason: "" }),
		...over,
	}) as any;

beforeEach(() => {
	query.mockReset();
});

describe("LLMClassifierScorer.evaluate", () => {
	test("structured_output with a valid label maps to score + metadata", async () => {
		queueResult({ structured: { choice: "B", reasoning: "half of it" } });
		const result = await new LLMClassifierScorer(validSpec).evaluate(
			dummyContext(),
		);
		expect(result.score).toBe(0.5);
		expect(result.reason).toBe("B — Partially");
		expect(result.metadata).toMatchObject({
			choice: "B",
			chosenDescription: "Partially",
			reasoning: "half of it",
		});
		expect(result.metadata!.choices).toEqual(validSpec.choices);
	});

	test("falls back to regex on result text when no structured_output", async () => {
		queueResult({ result: "After reasoning, my choice is A." });
		const result = await new LLMClassifierScorer(validSpec).evaluate(
			dummyContext(),
		);
		expect(result.score).toBe(1);
		expect(result.metadata!.choice).toBe("A");
	});

	test("parses JSON embedded in result text", async () => {
		queueResult({ result: 'prose {"choice":"C","reasoning":"nope"} trailing' });
		const result = await new LLMClassifierScorer(validSpec).evaluate(
			dummyContext(),
		);
		expect(result.score).toBe(0);
		expect(result.metadata!.choice).toBe("C");
		expect(result.metadata!.reasoning).toBe("nope");
	});

	test("unknown label yields score 0 flagged unrecognized, never undefined", async () => {
		queueResult({ structured: { choice: "Z", reasoning: "off-menu" } });
		const result = await new LLMClassifierScorer(validSpec).evaluate(
			dummyContext(),
		);
		expect(result.score).toBe(0);
		expect(result.reason).toContain("unrecognized choice 'Z'");
		expect(result.metadata!.unrecognized).toBe(true);
		expect(result).toBeDefined();
	});

	test("label match tolerates whitespace/case; metadata.choice is canonical", async () => {
		queueResult({ structured: { choice: "b ", reasoning: "x" } });
		const result = await new LLMClassifierScorer(validSpec).evaluate(
			dummyContext(),
		);
		expect(result.score).toBe(0.5);
		expect(result.metadata!.unrecognized).toBe(false);
		expect(result.metadata!.choice).toBe("B"); // canonical, not the raw 'b '
		expect(result.metadata!.rawChoice).toBe("b ");
	});

	test("fallback picks the concluding label, not an earlier rejected one", async () => {
		queueResult({ result: "It is not fully A; the correct answer is C." });
		const result = await new LLMClassifierScorer(validSpec).evaluate(
			dummyContext(),
		);
		expect(result.metadata!.choice).toBe("C");
		expect(result.score).toBe(0);
	});

	test('fallback ignores the prose article "a", keeping the real verdict', async () => {
		// "a call site" must not match label A and override the concluding "C".
		queueResult({
			result: "My verdict is C, because it left a call site untouched.",
		});
		const result = await new LLMClassifierScorer(validSpec).evaluate(
			dummyContext(),
		);
		expect(result.metadata!.choice).toBe("C");
		expect(result.score).toBe(0);
	});

	test("completed-but-unparseable output is a no-choice failure (score 0)", async () => {
		queueResult({ result: "   " });
		const result = await new LLMClassifierScorer(validSpec).evaluate(
			dummyContext(),
		);
		expect(result.score).toBe(0);
		expect(result.reason).toBe("judge returned no parseable choice");
		expect(result.metadata!.failure).toBe("no-choice");
	});

	test("judge that never completes (error subtype) is flagged as an infra failure", async () => {
		query.mockImplementation(() => {
			async function* gen() {
				yield { type: "result", subtype: "error_max_turns", result: "" };
			}
			return gen();
		});
		const result = await new LLMClassifierScorer(validSpec).evaluate(
			dummyContext(),
		);
		expect(result.score).toBe(0);
		expect(result.metadata!.failure).toBe("error");
		expect(result.reason).toContain("error_max_turns");
	});

	test("scorer name equals spec.name", () => {
		expect(new LLMClassifierScorer(validSpec).name).toBe("llm:demo");
	});

	test("generated prompt contains each choice label and description", async () => {
		queueResult({ structured: { choice: "A", reasoning: "" } });
		await new LLMClassifierScorer(validSpec).evaluate(dummyContext());
		const prompt = query.mock.calls[0][0].prompt as string;
		for (const c of validSpec.choices) {
			expect(prompt).toContain(c.label);
			expect(prompt).toContain(c.description);
		}
		// Rendered context vars land in the prompt.
		expect(prompt).toContain("refactor the parser");
		expect(prompt).toContain("diff --git");
		// Enum-constrained schema is passed through.
		const schema = query.mock.calls[0][0].options.outputFormat.schema;
		expect(schema.properties.choice.enum).toEqual(["A", "B", "C"]);
	});
});

describe("LLMClassifierScorer constructor validation", () => {
	const bad = (over: Partial<ClassifierSpec>) => () =>
		new LLMClassifierScorer({ ...validSpec, ...over } as ClassifierSpec);

	test("throws on empty instructions", () => {
		expect(bad({ instructions: "" })).toThrow(/instructions/);
	});

	test("throws on empty choices", () => {
		expect(bad({ choices: [] })).toThrow(/choices/);
	});

	test("throws on duplicate labels", () => {
		expect(
			bad({
				choices: [
					{ label: "A", description: "one", score: 1 },
					{ label: "A", description: "two", score: 0 },
				],
			}),
		).toThrow(/duplicate/);
	});

	test("throws on out-of-range score", () => {
		expect(
			bad({ choices: [{ label: "A", description: "x", score: 2 }] }),
		).toThrow(/0\.\.1/);
	});

	test("throws on blank description", () => {
		expect(
			bad({ choices: [{ label: "A", description: "", score: 1 }] }),
		).toThrow(/description/);
	});

	test("throws on unknown template var", () => {
		expect(bad({ instructions: "check {{dif}}" })).toThrow(
			/unknown template var/,
		);
	});

	test("throws on case-only-duplicate labels (matched case-insensitively at runtime)", () => {
		expect(
			bad({
				choices: [
					{ label: "a", description: "lower", score: 0 },
					{ label: "A", description: "upper", score: 1 },
				],
			}),
		).toThrow(/duplicate/);
	});

	test("throws on out-of-range passThreshold", () => {
		expect(bad({ passThreshold: 1.5 })).toThrow(/passThreshold/);
	});

	test("accepts a valid spec", () => {
		expect(bad({})).not.toThrow();
	});
});

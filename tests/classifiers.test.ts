import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ClassifierSpec, ScorerContext } from "../src";
import {
	CodeQuality,
	InstructionFollowing,
	isScorePassing,
	LLMClassifierScorer,
	Security,
} from "../src";

// Mock the SDK. `query` is driven per-test via `queueResult`.
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query }));

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
	}) as ScorerContext;

beforeEach(() => {
	query.mockReset();
});

const specs: Array<[string, ClassifierSpec]> = [
	["InstructionFollowing", InstructionFollowing],
	["CodeQuality", CodeQuality],
	["Security", Security],
];

describe("built-in classifiers are well-formed", () => {
	test.each(
		specs,
	)("%s passes validateSpec (constructs without throwing)", (_name, spec) => {
		expect(() => new LLMClassifierScorer(spec)).not.toThrow();
	});

	test.each(specs)("%s is namespaced llm:", (_name, spec) => {
		expect(spec.name).toMatch(/^llm:/);
	});

	test.each(
		specs,
	)("%s has unique labels, descriptions, and scores in 0..1", (_name, spec) => {
		const labels = spec.choices.map((c) => c.label);
		expect(new Set(labels).size).toBe(labels.length);
		for (const c of spec.choices) {
			expect(c.description.trim()).not.toBe("");
			expect(c.score).toBeGreaterThanOrEqual(0);
			expect(c.score).toBeLessThanOrEqual(1);
		}
	});

	// Graded built-ins must set a sub-1.0 passThreshold, else a non-top verdict
	// can never pass (the whole point of grading them).
	test.each(
		specs,
	)("%s sets a passThreshold below its top score", (_name, spec) => {
		expect(spec.passThreshold).toBeDefined();
		expect(spec.passThreshold ?? Number.NaN).toBeLessThan(1);
		expect(spec.passThreshold ?? Number.NaN).toBeGreaterThan(0);
	});
});

describe("built-in classifiers drive LLMClassifierScorer end-to-end", () => {
	test("InstructionFollowing maps a chosen label to its score + description", async () => {
		queueResult({ structured: { choice: "B", reasoning: "partial" } });
		const result = await new LLMClassifierScorer(InstructionFollowing).evaluate(
			dummyContext(),
		);
		expect(result.score).toBe(0.6);
		expect(result.metadata?.choice).toBe("B");
		expect(result.metadata?.chosenDescription).toBe(
			"Mostly — main request done, something minor missed",
		);
	});

	test("CodeQuality maps a chosen label to its score + description", async () => {
		queueResult({ structured: { choice: "A", reasoning: "clean" } });
		const result = await new LLMClassifierScorer(CodeQuality).evaluate(
			dummyContext(),
		);
		expect(result.score).toBe(1);
		expect(result.metadata?.choice).toBe("A");
		expect(result.metadata?.chosenDescription).toBe(
			"High — clear, idiomatic, easy to follow",
		);
	});

	test("Security maps a chosen label to its score + description", async () => {
		queueResult({ structured: { choice: "C", reasoning: "sql injection" } });
		const result = await new LLMClassifierScorer(Security).evaluate(
			dummyContext(),
		);
		expect(result.score).toBe(0);
		expect(result.metadata?.choice).toBe("C");
		expect(result.metadata?.chosenDescription).toBe(
			"Serious — a clear, exploitable vulnerability introduced",
		);
	});

	test("built-in passThreshold reaches the result so a graded verdict can pass", async () => {
		queueResult({ structured: { choice: "B", reasoning: "partial" } });
		const result = await new LLMClassifierScorer(InstructionFollowing).evaluate(
			dummyContext(),
		);
		expect(result.passThreshold).toBe(0.6);
		expect(isScorePassing(result)).toBe(true); // 0.6 >= 0.6
	});
});

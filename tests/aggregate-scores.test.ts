import { describe, expect, test } from "vitest";
import { calculateAggregateScores, isScorePassing } from "../src/runner";
import type { IterationResult, ScorerResult } from "../src/types";

const score = (partial: Partial<ScorerResult>): ScorerResult => ({
	score: 0,
	reason: "",
	...partial,
});

const iteration = (
	scores: Record<string, ScorerResult>,
	overrides: Partial<IterationResult> = {},
): IterationResult => ({
	iterationId: 0,
	promptId: "p",
	// Mirror the runner: an iteration passes iff every scorer passes.
	success: Object.values(scores).every(isScorePassing),
	duration: 0,
	scores,
	agentOutput: "",
	environmentVariables: {},
	...overrides,
});

describe("calculateAggregateScores", () => {
	test("mixed pass/fail scorers: per-scorer passRate honors each threshold", () => {
		// The failing-case e2e scenario as data: two scorers clear their bar, two
		// do not (a graded judge below a strict threshold, and a binary scorer).
		const it = iteration({
			build: score({ score: 1 }),
			"llm:instruction-following": score({ score: 1, passThreshold: 0.6 }),
			"llm:has-tests": score({ score: 0, passThreshold: 1.0 }),
			"farewell-exported": score({ score: 0 }),
		});

		const agg = calculateAggregateScores([it]);

		expect(agg.build.passRate).toBe(1);
		expect(agg["llm:instruction-following"].passRate).toBe(1);
		expect(agg["llm:has-tests"].passRate).toBe(0);
		expect(agg["farewell-exported"].passRate).toBe(0);

		// One failing scorer sinks the iteration, so overall is 0%.
		expect(agg._overall.passRate).toBe(0);
	});

	test("graded scorer averages across iterations; passRate counts threshold crossings", () => {
		const results = [
			iteration({ "llm:quality": score({ score: 0.4, passThreshold: 0.6 }) }),
			iteration({ "llm:quality": score({ score: 0.8, passThreshold: 0.6 }) }),
		];

		const agg = calculateAggregateScores(results);

		expect(agg["llm:quality"].mean).toBeCloseTo(0.6);
		expect(agg["llm:quality"].min).toBe(0.4);
		expect(agg["llm:quality"].max).toBe(0.8);
		// 0.4 fails, 0.8 passes -> half the iterations cross the bar.
		expect(agg["llm:quality"].passRate).toBe(0.5);
		// The 0.4 iteration failed, so overall is also 0.5.
		expect(agg._overall.passRate).toBe(0.5);
	});

	test("all scorers pass across all iterations: everything 100%", () => {
		const results = [
			iteration({ build: score({ score: 1 }), farewell: score({ score: 1 }) }),
			iteration({ build: score({ score: 1 }), farewell: score({ score: 1 }) }),
		];

		const agg = calculateAggregateScores(results);

		expect(agg.build.passRate).toBe(1);
		expect(agg.farewell.passRate).toBe(1);
		expect(agg._overall.passRate).toBe(1);
	});

	test("scorer absent from some iterations: aggregates only over present ones", () => {
		const results = [
			iteration({ build: score({ score: 1 }), flaky: score({ score: 0 }) }),
			iteration({ build: score({ score: 1 }) }), // no `flaky` this run
		];

		const agg = calculateAggregateScores(results);

		expect(agg.build.passRate).toBe(1);
		// `flaky` only appeared once (and failed), so its passRate is over n=1.
		expect(agg.flaky.passRate).toBe(0);
		expect(agg.flaky.mean).toBe(0);
		// First iteration failed (flaky=0), second passed -> 50% overall.
		expect(agg._overall.passRate).toBe(0.5);
	});

	test("no iterations: overall passRate is 0, no scorer entries", () => {
		const agg = calculateAggregateScores([]);
		expect(agg._overall.passRate).toBe(0);
		expect(Object.keys(agg)).toEqual(["_overall"]);
	});
});

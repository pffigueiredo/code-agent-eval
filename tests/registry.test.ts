import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileScorer } from "../src/scorers/registry";
import type { ExecCommandOptions, ScorerContext } from "../src/types";

const ctx = (over: Partial<ScorerContext> = {}): ScorerContext => ({
	workingDir: "/tmp",
	diff: "",
	agentOutput: "[]",
	promptId: "t",
	execCommand: async () => ({ score: 1, reason: "ok" }),
	...over,
});

describe("compileScorer", () => {
	it("build/test/lint compile to named Scorers", () => {
		expect(compileScorer({ type: "build" }).name).toBe("build");
		expect(compileScorer({ type: "test" }).name).toBe("test");
		expect(compileScorer({ type: "lint" }).name).toBe("lint");
	});

	it("command forwards args to execCommand", async () => {
		let received: ExecCommandOptions | undefined;
		const s = compileScorer({
			type: "command",
			name: "tc",
			command: "npm",
			args: ["run", "typecheck"],
		});
		expect(s.name).toBe("tc");
		await s.evaluate(
			ctx({
				execCommand: async (o) => {
					received = o;
					return { score: 1, reason: "ok" };
				},
			}),
		);
		expect(received).toMatchObject({
			command: "npm",
			args: ["run", "typecheck"],
		});
	});

	it("skill-picked-up compiles to named Scorer", () => {
		const s = compileScorer({ type: "skill-picked-up", skill: "commit" });
		expect(s.name).toBe("skill-picked-up:commit");
	});

	it("file compiles with auto-derived name", () => {
		const s = compileScorer({ type: "file", path: "README.md", exists: true });
		expect(s.name).toBe("file:README.md");
	});

	it("diff-contains compiles with auto-derived name", () => {
		const s = compileScorer({ type: "diff-contains", pattern: "foo" });
		expect(s.name).toBe("diff:foo");
	});

	it("all combinator: score = min of children", async () => {
		const s = compileScorer({
			type: "all",
			of: [
				{ type: "command", name: "pass", command: "true", args: [] },
				{ type: "command", name: "fail", command: "false", args: [] },
			],
		});
		expect(s.name).toBe("all:[pass,fail]");
		const r = await s.evaluate(
			ctx({
				execCommand: async (o) =>
					o.command === "true"
						? { score: 1, reason: "ok" }
						: { score: 0, reason: "fail" },
			}),
		);
		expect(r.score).toBe(0);
	});

	it("any combinator: score = max of children", async () => {
		const s = compileScorer({
			type: "any",
			of: [
				{ type: "command", name: "pass", command: "true", args: [] },
				{ type: "command", name: "fail", command: "false", args: [] },
			],
		});
		expect(s.name).toBe("any:[pass,fail]");
		const r = await s.evaluate(
			ctx({
				execCommand: async (o) =>
					o.command === "true"
						? { score: 1, reason: "ok" }
						: { score: 0, reason: "fail" },
			}),
		);
		expect(r.score).toBe(1);
	});

	it("all combinator with explicit name", () => {
		const s = compileScorer({
			type: "all",
			name: "my-all",
			of: [{ type: "build" }],
		});
		expect(s.name).toBe("my-all");
	});

	it("command surfaces fractional score from execCommand result", async () => {
		const s = compileScorer({
			type: "command",
			name: "partial",
			command: "scorer",
			args: [],
		});
		const r = await s.evaluate(
			ctx({
				execCommand: async () => ({ score: 0.75, reason: "partial coverage" }),
			}),
		);
		expect(r.score).toBe(0.75);
		expect(r.reason).toBe("partial coverage");
	});

	it("script clamps an out-of-range default-export score to 1", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reg-script-"));
		const scriptPath = path.join(dir, "over.mjs");
		fs.writeFileSync(
			scriptPath,
			"export default async () => ({ score: 5, reason: 'x' });\n",
		);
		const s = compileScorer({ type: "script", name: "over", path: scriptPath });
		const r = await s.evaluate(ctx());
		expect(r.score).toBe(1);
	});

	it("script maps a NaN default-export score to 0 instead of leaking NaN", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reg-script-"));
		const scriptPath = path.join(dir, "nan.mjs");
		fs.writeFileSync(
			scriptPath,
			"export default async () => ({ score: NaN, reason: 'x' });\n",
		);
		const s = compileScorer({ type: "script", name: "nan", path: scriptPath });
		const r = await s.evaluate(ctx());
		expect(r.score).toBe(0);
	});
});

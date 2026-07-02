import { describe, expect, it, vi } from "vitest";

// Mock the agent SDK so query() hangs until its abortController fires, then
// throws — mimicking a stuck agent run that the timeout must interrupt.
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
	query: vi.fn((args: { options: { abortController: AbortController } }) => {
		const signal: AbortSignal = args.options.abortController.signal;
		return (async function* () {
			await new Promise<void>((resolve) => {
				if (signal.aborted) return resolve();
				signal.addEventListener("abort", () => resolve(), { once: true });
			});
			throw new Error("aborted");
		})();
	}),
}));

// Keep the iteration off the real filesystem / git.
vi.mock("fs-extra", () => ({
	default: {
		copy: vi.fn().mockResolvedValue(undefined),
		pathExists: vi.fn().mockResolvedValue(true), // .git present -> skip git init
		writeFile: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("execa", () => ({
	execa: vi.fn().mockResolvedValue({ stdout: "" }),
}));

import { runClaudeCodeEval } from "../src/runner";

describe("EvalConfig.timeout enforcement", () => {
	it("fails the iteration with a timeout error when the agent hangs", async () => {
		const result = await runClaudeCodeEval({
			name: "timeout-test",
			prompts: [{ id: "default", prompt: "hang forever" }],
			projectDir: ".",
			installDependencies: false,
			timeout: 50,
		});

		expect(result.success).toBe(false);
		expect(result.iterations[0].error).toBe("Iteration timed out after 50ms");
	});
});

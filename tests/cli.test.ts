import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { describe, expect, it } from "vitest";
import { resolveOutputMode } from "../src/agent-detect";

const CLI = path.resolve("dist/cli.mjs");
const EVAL_FILE = path.resolve("examples/cli-test.ts");

// Helper: run CLI and return stdout, stderr, exitCode (never throws on non-zero)
// A key with value `undefined` in `env` unsets it for the child process.
async function run(
	args: string[],
	env?: Record<string, string | undefined>,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	try {
		const result = await execa("node", [CLI, ...args], {
			env: { ...process.env, ...env },
			reject: false,
		});
		return {
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: result.exitCode,
		};
	} catch (err) {
		const e = err as Record<string, unknown>;
		return {
			stdout: typeof e.stdout === "string" ? e.stdout : "",
			stderr: typeof e.stderr === "string" ? e.stderr : "",
			exitCode: typeof e.exitCode === "number" ? e.exitCode : 1,
		};
	}
}

describe("CLI: --version", () => {
	it("prints version to stdout and exits 0", async () => {
		const { stdout, exitCode } = await run(["--version"]);
		expect(exitCode).toBe(0);
		expect(stdout).toMatch(/^\d+\.\d+\.\d+/);
	});
});

describe("CLI: --help", () => {
	it("prints help to stdout and exits 0", async () => {
		const { stdout, exitCode } = await run(["--help"]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Usage:");
		expect(stdout).toContain("--eval-file");
		expect(stdout).toContain("Examples:");
		expect(stdout).toContain("Environment variables:");
	});

	it("includes --show-skill and --no-agent-detect in help", async () => {
		const { stdout } = await run(["--help"]);
		expect(stdout).toContain("--show-skill");
		expect(stdout).toContain("--no-agent-detect");
		expect(stdout).toContain("CODE_AGENT_EVAL_AGENT_DETECT");
	});

	it("documents the JSON authoring workflow", async () => {
		const { stdout } = await run(["--help"]);
		expect(stdout).toContain(".json");
		expect(stdout).toContain("--print-schema");
		// a .json example line
		expect(stdout).toMatch(/--eval-file \S+\.json/);
	});
});

describe("CLI: --show-skill", () => {
	it("outputs SKILL.md content and exits 0", async () => {
		const { stdout, exitCode } = await run(["--show-skill"]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("code-agent-eval");
		expect(stdout).toContain("Eval config format");
		expect(stdout).toContain("Scorer interface");
	});
});

describe("CLI: exit codes", () => {
	it("exits 2 when --eval-file is missing", async () => {
		const { exitCode, stderr } = await run([], { CLAUDECODE: "" });
		expect(exitCode).toBe(2);
		expect(stderr).toContain("--eval-file");
	});

	it("exits 2 on unknown flag", async () => {
		const { exitCode } = await run(["--nope"]);
		expect(exitCode).toBe(2);
	});

	it("exits 2 on invalid --iterations", async () => {
		const { exitCode } = await run([
			"--eval-file",
			EVAL_FILE,
			"--iterations",
			"-5",
			"--no-agent-detect",
		]);
		expect(exitCode).toBe(2);
	});

	it("exits 78 on bad config file", async () => {
		const { exitCode, stderr } = await run([
			"--eval-file",
			"./nonexistent.ts",
			"--no-agent-detect",
		]);
		expect(exitCode).toBe(78);
		expect(stderr).toContain("Fix:");
	});
});

describe("CLI: --json error output", () => {
	it("returns structured error for missing --eval-file", async () => {
		const { stdout, exitCode } = await run(["--json"]);
		expect(exitCode).toBe(2);
		const parsed = JSON.parse(stdout);
		expect(parsed.status).toBe("error");
		expect(parsed.error.code).toBe("MISSING_EVAL_FILE");
		expect(parsed.error.fix).toBeDefined();
		expect(parsed.error.transient).toBe(false);
		expect(parsed.agentDetection).toBeDefined();
	});

	it("returns structured error for bad config", async () => {
		const { stdout, exitCode } = await run([
			"--json",
			"--eval-file",
			"./nonexistent.ts",
		]);
		expect(exitCode).toBe(78);
		const parsed = JSON.parse(stdout);
		expect(parsed.status).toBe("error");
		expect(parsed.error.code).toBe("CONFIG_INVALID");
		expect(parsed.agentDetection).toBeDefined();
	});

	it("returns structured error for invalid --iterations", async () => {
		const { stdout, exitCode } = await run([
			"--json",
			"--eval-file",
			EVAL_FILE,
			"--iterations",
			"abc",
		]);
		expect(exitCode).toBe(2);
		const parsed = JSON.parse(stdout);
		expect(parsed.status).toBe("error");
		expect(parsed.error.code).toBe("INVALID_ARG");
		expect(parsed.agentDetection).toBeDefined();
	});
});

describe("CLI: eval file imports code-agent-eval (npx-style)", () => {
	it("loads .ts eval that imports package with cwd lacking local install", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-npx-"));
		const evalPath = path.join(dir, "eval.ts");
		fs.writeFileSync(
			evalPath,
			`import { BuildSuccessScorer } from 'code-agent-eval';

export default {
  name: 'npx-alias-test',
  prompts: [{ id: 'v1', prompt: 'noop' }],
  projectDir: '.',
  iterations: 1,
  installDependencies: false,
  scorers: [new BuildSuccessScorer()],
};
`,
			"utf-8",
		);
		try {
			const { stdout, stderr, exitCode } = await execa(
				"node",
				[CLI, "--dry-run", "--eval-file", evalPath, "--no-agent-detect"],
				{
					cwd: dir,
					env: { ...process.env, CLAUDECODE: "" },
					reject: false,
				},
			);
			expect(exitCode, stderr).toBe(0);
			expect(stdout).toContain("npx-alias-test");
			expect(stdout).toContain("build");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it("loads .mjs eval that imports package with cwd lacking local install", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-npx-"));
		const evalPath = path.join(dir, "eval.mjs");
		fs.writeFileSync(
			evalPath,
			`import { BuildSuccessScorer } from 'code-agent-eval';

export default {
  name: 'npx-alias-mjs',
  prompts: [{ id: 'v1', prompt: 'noop' }],
  projectDir: '.',
  iterations: 1,
  installDependencies: false,
  scorers: [new BuildSuccessScorer()],
};
`,
			"utf-8",
		);
		try {
			const { stdout, stderr, exitCode } = await execa(
				"node",
				[CLI, "--dry-run", "--eval-file", evalPath, "--no-agent-detect"],
				{
					cwd: dir,
					env: { ...process.env, CLAUDECODE: "" },
					reject: false,
				},
			);
			expect(exitCode, stderr).toBe(0);
			expect(stdout).toContain("npx-alias-mjs");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("CLI: --dry-run", () => {
	it("validates config and exits 0", async () => {
		const { stdout, exitCode } = await run([
			"--dry-run",
			"--eval-file",
			EVAL_FILE,
			"--no-agent-detect",
		]);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Config valid");
		expect(stdout).toContain("cli-test");
	});

	it("shows plan details", async () => {
		const { stdout } = await run([
			"--dry-run",
			"--eval-file",
			EVAL_FILE,
			"--no-agent-detect",
		]);
		expect(stdout).toContain("Eval:");
		expect(stdout).toContain("Prompts:");
		expect(stdout).toContain("Iterations:");
		expect(stdout).toContain("Scorers:");
	});

	it("returns JSON plan with --json", async () => {
		const { stdout, exitCode } = await run([
			"--dry-run",
			"--json",
			"--eval-file",
			EVAL_FILE,
		]);
		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.status).toBe("ok");
		expect(parsed.data.name).toBe("cli-test");
		expect(parsed.data.prompts).toEqual(["v1"]);
		expect(parsed.data.totalRuns).toBe(1);
		expect(parsed.data.scorers).toEqual(["build"]);
		expect(parsed.agentDetection).toBeDefined();
	});

	it("respects --iterations override in plan", async () => {
		const { stdout } = await run([
			"--dry-run",
			"--json",
			"--eval-file",
			EVAL_FILE,
			"--iterations",
			"7",
		]);
		const parsed = JSON.parse(stdout);
		expect(parsed.data.iterations).toBe(7);
		expect(parsed.data.totalRuns).toBe(7);
	});
});

describe("CLI: --threshold gating", () => {
	// Dummy key lets the run execute; all iterations fail → passRate 0.
	const failEnv = { ANTHROPIC_API_KEY: "sk-dummy", CLAUDECODE: "" };

	it("surfaces the resolved threshold in the dry-run plan", async () => {
		const { stdout } = await run(
			["--dry-run", "--json", "--eval-file", EVAL_FILE, "--threshold", "0.5"],
			{ CLAUDECODE: "" },
		);
		const parsed = JSON.parse(stdout);
		expect(parsed.data.threshold).toBe(0.5);
	});

	it("defaults threshold to 1.0 in the dry-run plan", async () => {
		const { stdout } = await run(
			["--dry-run", "--json", "--eval-file", EVAL_FILE],
			{ CLAUDECODE: "" },
		);
		const parsed = JSON.parse(stdout);
		expect(parsed.data.threshold).toBe(1);
	});

	it("exits 2 on out-of-range --threshold", async () => {
		const { exitCode, stderr } = await run(
			["--eval-file", EVAL_FILE, "--threshold", "1.5", "--no-agent-detect"],
			failEnv,
		);
		expect(exitCode).toBe(2);
		expect(stderr).toContain("--threshold");
	});

	it("--threshold 0 passes an all-failing run (exit 0)", async () => {
		const { exitCode } = await run(
			["--eval-file", EVAL_FILE, "--threshold", "0", "--no-agent-detect"],
			failEnv,
		);
		expect(exitCode).toBe(0);
	}, 120000);

	it("JSON status/verdict agree with the threshold exit code", async () => {
		const { exitCode, stdout } = await run(
			["--eval-file", EVAL_FILE, "--threshold", "0", "--json"],
			failEnv,
		);
		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		// Verdict is threshold-based → passes; raw success stays false.
		expect(parsed.status).toBe("ok");
		expect(parsed.data.verdict).toBe("pass");
		expect(parsed.data.threshold).toBe(0);
		expect(parsed.data.success).toBe(false);
	}, 120000);

	it("default threshold fails an all-failing run (exit 1)", async () => {
		const { exitCode } = await run(
			["--eval-file", EVAL_FILE, "--no-agent-detect"],
			failEnv,
		);
		expect(exitCode).toBe(1);
	}, 120000);

	it("honors CODE_AGENT_EVAL_THRESHOLD env override", async () => {
		const { exitCode } = await run(
			["--eval-file", EVAL_FILE, "--no-agent-detect"],
			{ ...failEnv, CODE_AGENT_EVAL_THRESHOLD: "0" },
		);
		expect(exitCode).toBe(0);
	}, 120000);
});

describe("CLI: --output artifacts", () => {
	// Dummy key lets the run execute; all iterations fail but a result is produced.
	const failEnv = { ANTHROPIC_API_KEY: "sk-dummy", CLAUDECODE: "" };

	it("exits 2 on unknown --output extension (before the run)", async () => {
		const { exitCode, stderr } = await run(
			["--eval-file", EVAL_FILE, "--output", "./out.txt", "--no-agent-detect"],
			failEnv,
		);
		expect(exitCode).toBe(2);
		expect(stderr).toContain("--output");
	});

	it("writes JUnit XML for a .xml --output", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-out-"));
		const xmlPath = path.join(dir, "out.xml");
		try {
			await run(
				["--eval-file", EVAL_FILE, "--output", xmlPath, "--no-agent-detect"],
				failEnv,
			);
			expect(fs.existsSync(xmlPath)).toBe(true);
			const content = fs.readFileSync(xmlPath, "utf-8");
			expect(content).toContain('<?xml version="1.0"');
			expect(content).toContain("<testsuites");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}, 120000);

	it("writes JSON for a .json --output", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-out-"));
		const jsonPath = path.join(dir, "out.json");
		try {
			await run(
				["--eval-file", EVAL_FILE, "--output", jsonPath, "--no-agent-detect"],
				failEnv,
			);
			expect(fs.existsSync(jsonPath)).toBe(true);
			const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
			expect(parsed.evalName).toBeDefined();
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}, 120000);

	it("creates missing parent directories for --output", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-out-"));
		const nested = path.join(dir, "a", "b", "out.xml");
		try {
			const { exitCode } = await run(
				[
					"--eval-file",
					EVAL_FILE,
					"--output",
					nested,
					"--threshold",
					"0",
					"--no-agent-detect",
				],
				failEnv,
			);
			// Threshold 0 → verdict pass → exit 0 (not a FATAL write crash).
			expect(exitCode).toBe(0);
			expect(fs.existsSync(nested)).toBe(true);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}, 120000);

	it("writes both when --output is repeated", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-out-"));
		const xmlPath = path.join(dir, "out.xml");
		const jsonPath = path.join(dir, "out.json");
		try {
			await run(
				[
					"--eval-file",
					EVAL_FILE,
					"--output",
					xmlPath,
					"--output",
					jsonPath,
					"--no-agent-detect",
				],
				failEnv,
			);
			expect(fs.existsSync(xmlPath)).toBe(true);
			expect(fs.existsSync(jsonPath)).toBe(true);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}, 120000);
});

describe("CLI: GitHub Step Summary", () => {
	// Dummy key lets the run execute; all iterations fail but a result is produced.
	const failEnv = { ANTHROPIC_API_KEY: "sk-dummy", CLAUDECODE: "" };

	it("appends a summary to $GITHUB_STEP_SUMMARY", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-sum-"));
		const summaryPath = path.join(dir, "summary.md");
		try {
			await run(["--eval-file", EVAL_FILE, "--no-agent-detect"], {
				...failEnv,
				GITHUB_STEP_SUMMARY: summaryPath,
			});
			expect(fs.existsSync(summaryPath)).toBe(true);
			const content = fs.readFileSync(summaryPath, "utf-8");
			expect(content).toContain("Eval:");
			expect(content).toContain("Pass Rate");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}, 120000);

	it("appends rather than overwriting existing content", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-sum-"));
		const summaryPath = path.join(dir, "summary.md");
		fs.writeFileSync(summaryPath, "PRE-EXISTING\n", "utf-8");
		try {
			await run(["--eval-file", EVAL_FILE, "--no-agent-detect"], {
				...failEnv,
				GITHUB_STEP_SUMMARY: summaryPath,
			});
			const content = fs.readFileSync(summaryPath, "utf-8");
			expect(content).toContain("PRE-EXISTING");
			expect(content).toContain("Eval:");
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	}, 120000);
});

describe("CLI: ANTHROPIC_API_KEY preflight", () => {
	const noKey = { ANTHROPIC_API_KEY: undefined, CLAUDECODE: "" };

	it("exits 69 with an actionable message when the key is unset", async () => {
		const { exitCode, stderr } = await run(
			["--eval-file", EVAL_FILE, "--no-agent-detect"],
			noKey,
		);
		expect(exitCode).toBe(69);
		expect(stderr).toContain("ANTHROPIC_API_KEY");
		expect(stderr).toContain("Fix:");
	});

	it("emits a JSON error envelope in --json mode", async () => {
		const { stdout, exitCode } = await run(
			["--json", "--eval-file", EVAL_FILE],
			noKey,
		);
		expect(exitCode).toBe(69);
		const parsed = JSON.parse(stdout);
		expect(parsed.status).toBe("error");
		expect(parsed.error.code).toBe("MISSING_API_KEY");
		expect(parsed.error.fix).toBeDefined();
		expect(parsed.error.transient).toBe(false);
		expect(parsed.agentDetection).toBeDefined();
	});

	it("skips the preflight for --dry-run (exit 0 with no key)", async () => {
		const { exitCode } = await run(
			["--dry-run", "--eval-file", EVAL_FILE, "--no-agent-detect"],
			noKey,
		);
		expect(exitCode).toBe(0);
	});
});

describe("CLI: env var overrides", () => {
	it("CODE_AGENT_EVAL_ITERATIONS overrides config", async () => {
		const { stdout } = await run(
			["--dry-run", "--json", "--eval-file", EVAL_FILE],
			{ CODE_AGENT_EVAL_ITERATIONS: "12" },
		);
		const parsed = JSON.parse(stdout);
		expect(parsed.data.iterations).toBe(12);
	});

	it("flag takes precedence over env var", async () => {
		const { stdout } = await run(
			["--dry-run", "--json", "--eval-file", EVAL_FILE, "--iterations", "3"],
			{ CODE_AGENT_EVAL_ITERATIONS: "12" },
		);
		const parsed = JSON.parse(stdout);
		expect(parsed.data.iterations).toBe(3);
	});

	it("CODE_AGENT_EVAL_RESULTS_DIR overrides config", async () => {
		const { stdout } = await run(
			["--dry-run", "--json", "--eval-file", EVAL_FILE],
			{ CODE_AGENT_EVAL_RESULTS_DIR: "/tmp/my-results" },
		);
		const parsed = JSON.parse(stdout);
		expect(parsed.data.resultsDir).toBe("/tmp/my-results");
	});
});

describe("CLI: stdout/stderr separation", () => {
	it("--version outputs only to stdout", async () => {
		const { stdout, stderr } = await run(["--version"]);
		expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
		expect(stderr).toBe("");
	});

	it("errors go to stderr in non-json mode", async () => {
		const { stdout, stderr, exitCode } = await run([], { CLAUDECODE: "" });
		expect(exitCode).toBe(2);
		expect(stderr).toContain("Error");
		expect(stdout).toBe("");
	});

	it("errors go to stdout as JSON in --json mode", async () => {
		const { stdout, exitCode } = await run(["--json"]);
		expect(exitCode).toBe(2);
		const parsed = JSON.parse(stdout);
		expect(parsed.status).toBe("error");
	});

	it("--dry-run plan goes to stdout", async () => {
		const { stdout, stderr } = await run([
			"--dry-run",
			"--eval-file",
			EVAL_FILE,
			"--no-agent-detect",
		]);
		expect(stdout).toContain("Config valid");
		// stderr should be empty (no runner progress in dry-run)
		expect(stderr).toBe("");
	});
});

describe("CLI: agent detection", () => {
	it("auto-detects agent and returns JSON", async () => {
		const { stdout, exitCode } = await run(
			["--dry-run", "--eval-file", EVAL_FILE],
			{ CLAUDECODE: "1" },
		);
		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.status).toBe("ok");
		expect(parsed.agentDetection.type).toBe("agent");
		expect(parsed.agentDetection.id).toBe("claude-code");
		expect(parsed.agentDetection.disabled).toBe(false);
	});

	it("agent + --json is idempotent", async () => {
		const { stdout, exitCode } = await run(
			["--dry-run", "--json", "--eval-file", EVAL_FILE],
			{ CLAUDECODE: "1" },
		);
		expect(exitCode).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.status).toBe("ok");
		expect(parsed.agentDetection.type).toBe("agent");
	});

	it("--no-agent-detect gives human output despite agent env", async () => {
		const { stdout, exitCode } = await run(
			["--dry-run", "--eval-file", EVAL_FILE, "--no-agent-detect"],
			{ CLAUDECODE: "1" },
		);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Config valid");
		// Should NOT be JSON
		expect(() => JSON.parse(stdout)).toThrow();
	});

	it("interactive env does not trigger auto-JSON", async () => {
		// CURSOR_TRACE_ID alone = interactive type, not agent
		const { stdout, exitCode } = await run(
			["--dry-run", "--eval-file", EVAL_FILE],
			{ CURSOR_TRACE_ID: "test-trace-id", CLAUDECODE: "" },
		);
		expect(exitCode).toBe(0);
		// Should be human-readable, not JSON
		expect(stdout).toContain("Config valid");
	});

	it("no agent env gives human output", async () => {
		const { stdout, exitCode } = await run(
			["--dry-run", "--eval-file", EVAL_FILE],
			{ CLAUDECODE: "" },
		);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Config valid");
	});

	it("agent + dry-run returns JSON plan with agentDetection", async () => {
		const { stdout } = await run(["--dry-run", "--eval-file", EVAL_FILE], {
			CLAUDECODE: "1",
		});
		const parsed = JSON.parse(stdout);
		expect(parsed.agentDetection).toBeDefined();
		expect(parsed.data.name).toBe("cli-test");
	});

	it("CODE_AGENT_EVAL_AGENT_DETECT=0 disables detection", async () => {
		const { stdout, exitCode } = await run(
			["--dry-run", "--eval-file", EVAL_FILE],
			{ CLAUDECODE: "1", CODE_AGENT_EVAL_AGENT_DETECT: "0" },
		);
		expect(exitCode).toBe(0);
		expect(stdout).toContain("Config valid");
		expect(() => JSON.parse(stdout)).toThrow();
	});

	it("agentDetection in JSON error envelope", async () => {
		const { stdout } = await run(["--json"], { CLAUDECODE: "1" });
		const parsed = JSON.parse(stdout);
		expect(parsed.agentDetection).toBeDefined();
		expect(parsed.agentDetection.type).toBe("agent");
	});
});

describe("CLI: JSON config", () => {
	it("--dry-run --json prints ok plan with scorer names", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-json-"));
		const f = path.join(dir, "eval.json");
		fs.writeFileSync(
			f,
			JSON.stringify({
				name: "json-test",
				prompts: [{ id: "v1", prompt: "p" }],
				projectDir: ".",
				scorers: [
					{ type: "build" },
					{
						type: "command",
						name: "tc",
						command: "npm",
						args: ["run", "typecheck"],
					},
				],
			}),
		);
		const { stdout, exitCode } = await run([
			"--eval-file",
			f,
			"--dry-run",
			"--json",
		]);
		expect(exitCode).toBe(0);
		const out = JSON.parse(stdout);
		expect(out.status).toBe("ok");
		expect(out.data.scorers).toEqual(["build", "tc"]);
	});

	it("malformed JSON config yields CONFIG_INVALID (exit 78)", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-json-"));
		const f = path.join(dir, "bad.json");
		fs.writeFileSync(
			f,
			JSON.stringify({
				name: "x",
				prompts: [{ id: "v1", prompt: "p" }],
				projectDir: ".",
				iteration: 5,
			}),
		);
		const { stdout, exitCode } = await run(["--eval-file", f, "--json"]);
		expect(exitCode).toBe(78);
		expect(JSON.parse(stdout).error.code).toBe("CONFIG_INVALID");
	});
});

describe("CLI: --print-schema", () => {
	it("exits 0 and stdout parses as JSON", async () => {
		const { stdout, exitCode } = await run(["--print-schema"]);
		expect(exitCode).toBe(0);
		expect(() => JSON.parse(stdout)).not.toThrow();
	});

	it("schema is strict (additionalProperties false)", async () => {
		const { stdout } = await run(["--print-schema"]);
		const schema = JSON.parse(stdout);
		expect(schema.additionalProperties).toBe(false);
	});

	it("$defs contains all scorer types", async () => {
		const { stdout } = await run(["--print-schema"]);
		const schema = JSON.parse(stdout);
		const defsStr = JSON.stringify(
			schema.$defs ?? schema.definitions ?? schema,
		);
		for (const type of [
			"build",
			"test",
			"lint",
			"command",
			"file",
			"diff-contains",
			"skill-picked-up",
			"script",
			"all",
			"any",
		]) {
			expect(defsStr).toContain(type);
		}
	});
});

describe("CLI: script scorer dry-run validation", () => {
	it("valid script scorer exits 0 with status ok", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-script-"));
		const scorerPath = path.join(dir, "scorer.mjs");
		fs.writeFileSync(
			scorerPath,
			'export default async (ctx) => ({ score: 1, reason: "ok" });\n',
		);
		const f = path.join(dir, "eval.json");
		fs.writeFileSync(
			f,
			JSON.stringify({
				name: "script-test",
				prompts: [{ id: "v1", prompt: "p" }],
				projectDir: ".",
				scorers: [{ type: "script", name: "my-script", path: "./scorer.mjs" }],
			}),
		);
		const { stdout, exitCode } = await run([
			"--eval-file",
			f,
			"--dry-run",
			"--json",
		]);
		expect(exitCode).toBe(0);
		const out = JSON.parse(stdout);
		expect(out.status).toBe("ok");
		expect(out.data.scorers).toEqual(["my-script"]);
	});

	it("broken script (syntax error) yields SCORER_INVALID (exit 78)", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-script-"));
		const scorerPath = path.join(dir, "broken.mjs");
		fs.writeFileSync(scorerPath, "this is not valid javascript !!!\n");
		const f = path.join(dir, "eval.json");
		fs.writeFileSync(
			f,
			JSON.stringify({
				name: "broken-test",
				prompts: [{ id: "v1", prompt: "p" }],
				projectDir: ".",
				scorers: [{ type: "script", name: "broken", path: "./broken.mjs" }],
			}),
		);
		const { stdout, exitCode } = await run([
			"--eval-file",
			f,
			"--dry-run",
			"--json",
		]);
		expect(exitCode).toBe(78);
		const out = JSON.parse(stdout);
		expect(out.status).toBe("error");
		expect(out.error.code).toBe("SCORER_INVALID");
	});

	it("non-function default export yields SCORER_INVALID (exit 78)", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-script-"));
		const scorerPath = path.join(dir, "num.mjs");
		fs.writeFileSync(scorerPath, "export default 42;\n");
		const f = path.join(dir, "eval.json");
		fs.writeFileSync(
			f,
			JSON.stringify({
				name: "num-test",
				prompts: [{ id: "v1", prompt: "p" }],
				projectDir: ".",
				scorers: [{ type: "script", name: "num-scorer", path: "./num.mjs" }],
			}),
		);
		const { stdout, exitCode } = await run([
			"--eval-file",
			f,
			"--dry-run",
			"--json",
		]);
		expect(exitCode).toBe(78);
		const out = JSON.parse(stdout);
		expect(out.status).toBe("error");
		expect(out.error.code).toBe("SCORER_INVALID");
	});

	it("dry-run does not invoke evaluate (sentinel file not written)", async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cae-script-"));
		const sentinelPath = path.join(dir, "sentinel");
		const scorerPath = path.join(dir, "sentinel-scorer.mjs");
		// The module top-level does NOT write the sentinel; only evaluate() does.
		fs.writeFileSync(
			scorerPath,
			`import fs from 'node:fs';
export default async function evaluate(ctx) {
  fs.writeFileSync(${JSON.stringify(sentinelPath)}, 'touched');
  return { score: 1, reason: 'ok' };
}
`,
		);
		const f = path.join(dir, "eval.json");
		fs.writeFileSync(
			f,
			JSON.stringify({
				name: "sentinel-test",
				prompts: [{ id: "v1", prompt: "p" }],
				projectDir: ".",
				scorers: [
					{ type: "script", name: "sentinel", path: "./sentinel-scorer.mjs" },
				],
			}),
		);
		const { exitCode } = await run(["--eval-file", f, "--dry-run", "--json"]);
		expect(exitCode).toBe(0);
		expect(fs.existsSync(sentinelPath)).toBe(false);
	});
});

describe("resolveOutputMode", () => {
	const agentDetection = {
		isAgentic: true,
		id: "claude-code",
		name: "Claude Code",
		type: "agent" as const,
	};

	const noDetection = {
		isAgentic: false,
		id: null,
		name: null,
		type: null,
	};

	const interactiveDetection = {
		isAgentic: true,
		id: "cursor",
		name: "Cursor",
		type: "interactive" as const,
	};

	it("jsonFlag takes precedence over everything", () => {
		const result = resolveOutputMode({
			jsonFlag: true,
			agentDetectFlag: false,
			agentDetectEnv: "0",
			detection: noDetection,
		});
		expect(result.isJson).toBe(true);
		expect(result.isAgentMode).toBe(false);
	});

	it("agent detection enables JSON", () => {
		const result = resolveOutputMode({
			jsonFlag: false,
			agentDetectFlag: true,
			agentDetectEnv: undefined,
			detection: agentDetection,
		});
		expect(result.isJson).toBe(true);
		expect(result.isAgentMode).toBe(true);
		expect(result.agentDetection.disabled).toBe(false);
	});

	it("disabled flag prevents agent mode", () => {
		const result = resolveOutputMode({
			jsonFlag: false,
			agentDetectFlag: false,
			agentDetectEnv: undefined,
			detection: agentDetection,
		});
		expect(result.isJson).toBe(false);
		expect(result.isAgentMode).toBe(false);
		expect(result.agentDetection.disabled).toBe(true);
	});

	it('env var "0" disables detection', () => {
		const result = resolveOutputMode({
			jsonFlag: false,
			agentDetectFlag: true,
			agentDetectEnv: "0",
			detection: agentDetection,
		});
		expect(result.isJson).toBe(false);
		expect(result.isAgentMode).toBe(false);
		expect(result.agentDetection.disabled).toBe(true);
	});

	it("interactive type does not trigger agent mode", () => {
		const result = resolveOutputMode({
			jsonFlag: false,
			agentDetectFlag: true,
			agentDetectEnv: undefined,
			detection: interactiveDetection,
		});
		expect(result.isJson).toBe(false);
		expect(result.isAgentMode).toBe(false);
	});

	it("no detection returns human mode", () => {
		const result = resolveOutputMode({
			jsonFlag: false,
			agentDetectFlag: true,
			agentDetectEnv: undefined,
			detection: noDetection,
		});
		expect(result.isJson).toBe(false);
		expect(result.isAgentMode).toBe(false);
	});
});

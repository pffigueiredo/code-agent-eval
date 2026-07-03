#!/usr/bin/env node
import {
	appendFileSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { format, parseArgs } from "node:util";
import { detectAgenticEnvironment } from "am-i-vibing";
import { z } from "zod";
import type { AgentDetectionResult } from "./agent-detect";
import { resolveOutputMode } from "./agent-detect";
import { collectScriptScorers, loadEvalFile } from "./eval-config-loader";
import {
	formatResultsAsGitHubSummary,
	formatResultsAsJson,
	formatResultsAsJUnit,
	formatResultsAsMarkdown,
} from "./results-writer";
import type { EvalConfig } from "./runner";
import { runClaudeCodeEval } from "./runner";
import { validateScriptScorer } from "./scorers/registry";
import { jsonConfigSchema } from "./scorers/schema";
import type { EvalResult } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { version } = require("../package.json");

// Semantic exit codes
const EXIT = {
	SUCCESS: 0,
	EVAL_FAILURE: 1,
	USAGE: 2,
	UNAVAILABLE: 69,
	CONFIG: 78,
} as const;

// Pick an artifact formatter from a file's extension. Returns null for unknown.
function formatterForPath(
	outputPath: string,
): ((result: EvalResult) => string) | null {
	const lower = outputPath.toLowerCase();
	if (lower.endsWith(".xml")) return formatResultsAsJUnit;
	if (lower.endsWith(".json")) return formatResultsAsJson;
	if (lower.endsWith(".md")) return formatResultsAsMarkdown;
	return null;
}

// stdout helpers — never affected by console.log override
function stdout(text: string): void {
	process.stdout.write(`${text}\n`);
}

function stdoutJson(data: unknown): void {
	process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

const help = `code-agent-eval v${version} - Evaluate coding agents with structured evals

Usage: code-agent-eval --eval-file <path> [options]

Options:
  --eval-file <path>     Path to eval config file (.json / .jsonl / .ts / .js)
  --iterations <n>       Override iteration count
  --threshold <0..1>     Pass when overall pass rate >= this (default 1.0)
  --verbose              Enable verbose logging
  --results-dir <path>   Override results directory
  --output <path>        Write an artifact; format inferred from extension
                         (.xml/.junit.xml → JUnit, .json → JSON, .md → Markdown).
                         Repeatable.
  --json                 Output results as JSON to stdout
  --dry-run              Validate config and show execution plan
  --print-schema         Print JSON Schema for eval config and exit
  --show-skill           Print agent skill guide (eval config format, scorers, examples)
  --no-agent-detect      Disable automatic AI agent detection
  --help                 Show help
  --version              Show version

Environment variables:
  CODE_AGENT_EVAL_ITERATIONS     Override iteration count
  CODE_AGENT_EVAL_THRESHOLD      Override pass-rate threshold (0..1)
  CODE_AGENT_EVAL_VERBOSE        Set to "1" or "true" for verbose
  CODE_AGENT_EVAL_RESULTS_DIR    Override results directory
  CODE_AGENT_EVAL_AGENT_DETECT   Set to "0" to disable agent detection

Examples:
  $ code-agent-eval --eval-file ./evals/health-check.json
  $ code-agent-eval --eval-file ./evals/refactor.ts --iterations 5
  $ code-agent-eval --eval-file ./evals/refactor.json --dry-run
  $ code-agent-eval --eval-file ./evals/refactor.ts --json > results.json
  $ code-agent-eval --eval-file ./evals/refactor.ts --results-dir ./out

Authoring evals: JSON is the primary format — write eval.json with
"$schema": "https://unpkg.com/code-agent-eval/schema.json", or run
--print-schema to get the schema, then validate with --dry-run.
The .ts/.js path remains for custom (function) scorers.
`;

// --- Main ---

async function main() {
	let values: Record<string, string | string[] | boolean | undefined>;
	try {
		({ values } = parseArgs({
			options: {
				"eval-file": { type: "string" },
				iterations: { type: "string" },
				threshold: { type: "string" },
				verbose: { type: "boolean", default: false },
				"results-dir": { type: "string" },
				output: { type: "string", multiple: true },
				json: { type: "boolean", default: false },
				"dry-run": { type: "boolean", default: false },
				"agent-detect": { type: "boolean", default: true },
				"print-schema": { type: "boolean", default: false },
				"show-skill": { type: "boolean", default: false },
				help: { type: "boolean", default: false },
				version: { type: "boolean", default: false },
			},
			strict: true,
			allowNegative: true,
		}));
	} catch (err) {
		const errMsg = err instanceof Error ? err.message : String(err);
		console.error(`Error: ${errMsg}`);
		console.error('Run "code-agent-eval --help" for usage.');
		process.exit(EXIT.USAGE);
	}

	// Early exits — no detection needed
	if (values.version) {
		stdout(version);
		process.exit(EXIT.SUCCESS);
	}

	if (values.help) {
		stdout(help);
		process.exit(EXIT.SUCCESS);
	}

	if (values["print-schema"]) {
		process.stdout.write(
			`${JSON.stringify(z.toJSONSchema(jsonConfigSchema), null, 2)}\n`,
		);
		process.exit(EXIT.SUCCESS);
	}

	if (values["show-skill"]) {
		try {
			const skillPath = path.join(__dirname, "..", "SKILL.md");
			const content = readFileSync(skillPath, "utf-8");
			process.stdout.write(content);
		} catch {
			console.error("Error: SKILL.md not found");
		}
		process.exit(EXIT.SUCCESS);
	}

	// Agent detection — lazy, only runs after early exits
	let detection: AgentDetectionResult = {
		isAgentic: false,
		id: null,
		name: null,
		type: null,
	};
	try {
		detection = detectAgenticEnvironment() as AgentDetectionResult;
	} catch {
		// Graceful fallback — treat as non-agentic
	}

	const { isJson, agentDetection } = resolveOutputMode({
		jsonFlag: values.json as boolean,
		agentDetectFlag: values["agent-detect"] as boolean,
		agentDetectEnv: process.env.CODE_AGENT_EVAL_AGENT_DETECT,
		detection,
	});

	// Route runner's console.log to stderr so stdout stays clean for data output.
	// console.error already writes to stderr — no override needed.
	console.log = (...args: unknown[]) => {
		process.stderr.write(`${format(...args)}\n`);
	};

	if (!values["eval-file"]) {
		if (isJson) {
			stdoutJson({
				status: "error",
				agentDetection,
				error: {
					code: "MISSING_EVAL_FILE",
					message: "--eval-file <path> is required",
					fix: "code-agent-eval --eval-file <path>",
					transient: false,
				},
			});
		} else {
			console.error("Error: --eval-file <path> is required");
			console.error('Run "code-agent-eval --help" for usage.');
		}
		process.exit(EXIT.USAGE);
	}

	let config: EvalConfig;
	try {
		config = await loadEvalFile(values["eval-file"] as string);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (isJson) {
			stdoutJson({
				status: "error",
				agentDetection,
				error: {
					code: "CONFIG_INVALID",
					message: msg,
					fix: `Check eval file: ${values["eval-file"]}`,
					transient: false,
				},
			});
		} else {
			console.error(`Error: Failed to load eval file: ${values["eval-file"]}`);
			console.error(msg);
			console.error(
				"\nFix: Ensure the file exports a valid EvalConfig object.",
			);
		}
		process.exit(EXIT.CONFIG);
	}

	// Overrides: flags > env vars > config
	const overrides: Partial<EvalConfig> = {};

	const iterFlag = values.iterations as string | undefined;
	const iterEnv = process.env.CODE_AGENT_EVAL_ITERATIONS;
	if (iterFlag) {
		const n = parseInt(iterFlag, 10);
		if (Number.isNaN(n) || n < 1) {
			if (isJson) {
				stdoutJson({
					status: "error",
					agentDetection,
					error: {
						code: "INVALID_ARG",
						message: "--iterations must be a positive integer",
						transient: false,
					},
				});
			} else {
				console.error("Error: --iterations must be a positive integer");
			}
			process.exit(EXIT.USAGE);
		}
		overrides.iterations = n;
	} else if (iterEnv) {
		const n = parseInt(iterEnv, 10);
		if (!Number.isNaN(n) && n >= 1) overrides.iterations = n;
	}

	const thresholdFlag = values.threshold as string | undefined;
	const thresholdEnv = process.env.CODE_AGENT_EVAL_THRESHOLD;
	const thresholdRaw = thresholdFlag ?? thresholdEnv;
	if (thresholdRaw !== undefined) {
		const t = Number(thresholdRaw);
		if (Number.isNaN(t) || t < 0 || t > 1) {
			if (isJson) {
				stdoutJson({
					status: "error",
					agentDetection,
					error: {
						code: "INVALID_ARG",
						message: "--threshold must be a number between 0 and 1",
						transient: false,
					},
				});
			} else {
				console.error("Error: --threshold must be a number between 0 and 1");
			}
			process.exit(EXIT.USAGE);
		}
		overrides.passThreshold = t;
	}

	// Validate --output paths up front (before the run burns time).
	const outputPaths = (values.output as string[] | undefined) ?? [];
	for (const outputPath of outputPaths) {
		if (!formatterForPath(outputPath)) {
			if (isJson) {
				stdoutJson({
					status: "error",
					agentDetection,
					error: {
						code: "INVALID_ARG",
						message: `--output: unsupported extension for "${outputPath}" (use .xml, .json, or .md)`,
						transient: false,
					},
				});
			} else {
				console.error(
					`Error: --output: unsupported extension for "${outputPath}" (use .xml, .json, or .md)`,
				);
			}
			process.exit(EXIT.USAGE);
		}
	}

	if (
		values.verbose ||
		["1", "true"].includes(process.env.CODE_AGENT_EVAL_VERBOSE ?? "")
	) {
		overrides.verbose = true;
	}

	const rdir =
		(values["results-dir"] as string | undefined) ??
		process.env.CODE_AGENT_EVAL_RESULTS_DIR;
	if (rdir) overrides.resultsDir = rdir;

	const finalConfig = { ...config, ...overrides };
	const iterations = finalConfig.iterations ?? 1;
	const totalRuns = finalConfig.prompts.length * iterations;
	const execMode = finalConfig.execution?.mode ?? "sequential";

	// --dry-run: validate config and show plan without running
	if (values["dry-run"]) {
		// Validate script scorers for JSON configs (import + assert callable, never invoke)
		if (/\.jsonl?$/i.test(values["eval-file"] as string)) {
			try {
				for (const s of await collectScriptScorers(
					values["eval-file"] as string,
				)) {
					await validateScriptScorer(s);
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (isJson) {
					stdoutJson({
						status: "error",
						agentDetection,
						error: {
							code: "SCORER_INVALID",
							message,
							fix: "Fix the script scorer module (export default a function).",
							transient: false,
						},
					});
				} else {
					console.error(`Error: ${message}`);
				}
				process.exit(EXIT.CONFIG);
			}
		}

		const plan = {
			name: finalConfig.name,
			prompts: finalConfig.prompts.map((p) => p.id),
			iterations,
			totalRuns,
			execution: execMode,
			threshold: finalConfig.passThreshold ?? 1.0,
			scorers: (finalConfig.scorers ?? []).map((s) => s.name),
			resultsDir: finalConfig.resultsDir ?? null,
			projectDir: path.resolve(finalConfig.projectDir),
		};

		if (isJson) {
			stdoutJson({ status: "ok", agentDetection, data: plan });
		} else {
			stdout(
				`Config valid. Would run ${totalRuns} eval(s) for "${plan.name}".`,
			);
			stdout("");
			stdout(`  Eval:       ${plan.name}`);
			stdout(`  Prompts:    ${plan.prompts.join(", ")}`);
			stdout(`  Iterations: ${iterations}`);
			stdout(`  Total runs: ${totalRuns}`);
			stdout(`  Execution:  ${execMode}`);
			stdout(`  Threshold:  ${plan.threshold}`);
			stdout(
				`  Scorers:    ${plan.scorers.length ? plan.scorers.join(", ") : "(none)"}`,
			);
			stdout(`  Results:    ${plan.resultsDir ?? "(not configured)"}`);
			stdout(`  Project:    ${plan.projectDir}`);
		}
		process.exit(EXIT.SUCCESS);
	}

	// Fail fast on a missing API key before any iteration runs.
	if (!process.env.ANTHROPIC_API_KEY) {
		if (isJson) {
			stdoutJson({
				status: "error",
				agentDetection,
				error: {
					code: "MISSING_API_KEY",
					message: "ANTHROPIC_API_KEY is not set",
					fix: "Set ANTHROPIC_API_KEY in your environment before running an eval.",
					transient: false,
				},
			});
		} else {
			console.error("Error: ANTHROPIC_API_KEY is not set");
			console.error(
				"Fix: Set ANTHROPIC_API_KEY in your environment before running an eval.",
			);
			console.error("     export ANTHROPIC_API_KEY=sk-...");
		}
		process.exit(EXIT.UNAVAILABLE);
	}

	// Run eval
	const result = await runClaudeCodeEval(finalConfig);

	// Threshold-based verdict drives the exit code, JSON status, and headline.
	const threshold = finalConfig.passThreshold ?? 1.0;
	const overallPassRate =
		result.aggregateScores._overall?.passRate ?? (result.success ? 1 : 0);
	const verdict = overallPassRate >= threshold;

	// Output results
	const evalFile = values["eval-file"];

	if (isJson) {
		stdoutJson({
			status: verdict ? "ok" : "error",
			agentDetection,
			data: {
				evalName: result.evalName,
				agentId: result.agentId,
				timestamp: result.timestamp,
				verdict: verdict ? "pass" : "fail",
				threshold,
				success: result.success,
				duration: result.duration,
				aggregateScores: result.aggregateScores,
				tokenUsage: result.tokenUsage,
				iterationCount: result.iterations.length,
				iterations: result.iterations.map((it) => ({
					iterationId: it.iterationId,
					promptId: it.promptId,
					success: it.success,
					duration: it.duration,
					scores: it.scores,
					tokenUsage: it.tokenUsage,
					workingDir: it.workingDir,
					error: it.error,
				})),
			},
		});
	} else {
		const passRate = overallPassRate * 100;
		const passedCount = result.iterations.filter((i) => i.success).length;
		const total = result.iterations.length;
		const durSec = (result.duration / 1000).toFixed(1);

		stdout("");
		stdout(
			`Eval "${result.evalName}" ${verdict ? "passed" : "failed"}: ${passedCount}/${total} passed (${passRate.toFixed(1)}%, threshold ${(threshold * 100).toFixed(0)}%) in ${durSec}s`,
		);
		stdout("");
		stdout("Next steps:");
		if (verdict) {
			if (finalConfig.resultsDir) {
				stdout(`  View results:    cat ${finalConfig.resultsDir}/*/results.md`);
			}
			stdout(
				`  Export as JSON:  code-agent-eval --eval-file ${evalFile} --json`,
			);
			stdout(
				`  More iterations: code-agent-eval --eval-file ${evalFile} --iterations ${iterations * 2}`,
			);
		} else {
			stdout(
				`  Re-run verbose:  code-agent-eval --eval-file ${evalFile} --verbose`,
			);
			stdout(
				`  Export details:  code-agent-eval --eval-file ${evalFile} --json`,
			);
			const preserved = result.iterations.filter((i) => i.workingDir);
			if (preserved.length > 0) {
				stdout(`  Inspect temp:    cd ${preserved[0].workingDir}`);
			}
		}
	}

	// Write --output artifacts (format inferred from extension).
	for (const outputPath of outputPaths) {
		const formatter = formatterForPath(outputPath);
		if (!formatter) continue; // already validated above
		mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
		writeFileSync(outputPath, formatter(result), "utf-8");
		if (!isJson) stdout(`  Wrote artifact:  ${outputPath}`);
	}

	// $GITHUB_STEP_SUMMARY is both the opt-in signal and the target file.
	const summaryPath = process.env.GITHUB_STEP_SUMMARY;
	if (summaryPath) {
		appendFileSync(summaryPath, formatResultsAsGitHubSummary(result), "utf-8");
		if (!isJson) stdout(`  Wrote summary:   ${summaryPath}`);
	}

	process.exit(verdict ? EXIT.SUCCESS : EXIT.EVAL_FAILURE);
}

main().catch((err) => {
	const isJson = process.argv.includes("--json");
	if (isJson) {
		stdoutJson({
			status: "error",
			error: {
				code: "FATAL",
				message: err instanceof Error ? err.message : String(err),
				transient: false,
			},
		});
	} else {
		console.error("Fatal error:", err);
	}
	process.exit(1);
});

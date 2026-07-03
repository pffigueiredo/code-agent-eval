import path from "node:path";
import fs from "fs-extra";
import type { EvalResult, IterationResult } from "./types";

/**
 * Format a timestamp as YYYY-MM-DD-HHMMSS for filenames
 */
function formatTimestampForFilename(isoString: string): string {
	const date = new Date(isoString);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");
	return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

/**
 * Sanitize eval name for use in filename
 */
function sanitizeForFilename(name: string): string {
	return name.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
}

/**
 * Escape a value for safe inclusion in a Markdown table cell: pipes would
 * split the cell and newlines would break the row.
 */
function escapeMarkdownCell(value: string): string {
	return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/**
 * Per-prompt pass-rate breakdown, shared by the Markdown and GitHub-summary
 * formatters so they can't drift.
 */
function perPromptStats(
	result: EvalResult,
): Array<{ promptId: string; passRate: number; runs: number }> {
	const promptIds = [...new Set(result.iterations.map((i) => i.promptId))];
	return promptIds.map((promptId) => {
		const runs = result.iterations.filter((i) => i.promptId === promptId);
		return {
			promptId,
			runs: runs.length,
			passRate: runs.filter((r) => r.success).length / runs.length,
		};
	});
}

/**
 * Format a single iteration's output as a log file
 */
function formatIterationLog(iteration: IterationResult): string {
	const lines: string[] = [];

	// Header
	lines.push(`Iteration ${iteration.iterationId}`);
	lines.push(`Prompt ID: ${iteration.promptId}`);
	lines.push("=".repeat(60));
	lines.push(`Status: ${iteration.success ? "✓ PASS" : "✗ FAIL"}`);
	lines.push(`Duration: ${(iteration.duration / 1000).toFixed(2)}s`);
	lines.push("");

	// Environment variables
	if (Object.keys(iteration.environmentVariables).length > 0) {
		lines.push("Environment Variables:");
		for (const [key, value] of Object.entries(iteration.environmentVariables)) {
			lines.push(`  ${key}=${value}`);
		}
		lines.push("");
	}

	// Agent output
	lines.push("=".repeat(60));
	lines.push("AGENT OUTPUT");
	lines.push("=".repeat(60));
	lines.push("");

	if (iteration.agentOutput) {
		// Pretty print the JSON for better readability
		try {
			const parsed = JSON.parse(iteration.agentOutput);
			lines.push(JSON.stringify(parsed, null, 2));
		} catch {
			// If parsing fails, just dump the raw output
			lines.push(iteration.agentOutput);
		}
	} else {
		lines.push("(No agent output available)");
	}
	lines.push("");

	// Scores
	if (Object.keys(iteration.scores).length > 0) {
		lines.push("=".repeat(60));
		lines.push("SCORES");
		lines.push("=".repeat(60));
		lines.push("");
		for (const [name, score] of Object.entries(iteration.scores)) {
			lines.push(`${name}: ${score.score.toFixed(3)}`);
			lines.push(`  Reason: ${score.reason}`);
			if (score.metadata && Object.keys(score.metadata).length > 0) {
				lines.push(`  Metadata: ${JSON.stringify(score.metadata)}`);
			}
			lines.push("");
		}
	}

	// Error (if any)
	if (iteration.error) {
		lines.push("=".repeat(60));
		lines.push("ERROR");
		lines.push("=".repeat(60));
		lines.push("");
		lines.push(iteration.error);
		lines.push("");
	}

	// Token usage
	if (iteration.tokenUsage) {
		lines.push("=".repeat(60));
		lines.push("TOKEN USAGE");
		lines.push("=".repeat(60));
		lines.push("");
		lines.push(
			`Input Tokens: ${iteration.tokenUsage.inputTokens.toLocaleString()}`,
		);
		lines.push(
			`Output Tokens: ${iteration.tokenUsage.outputTokens.toLocaleString()}`,
		);
		if (iteration.tokenUsage.cacheCreationInputTokens) {
			lines.push(
				`Cache Creation Input Tokens: ${iteration.tokenUsage.cacheCreationInputTokens.toLocaleString()}`,
			);
		}
		if (iteration.tokenUsage.cacheReadInputTokens) {
			lines.push(
				`Cache Read Input Tokens: ${iteration.tokenUsage.cacheReadInputTokens.toLocaleString()}`,
			);
		}
		const totalInput =
			iteration.tokenUsage.inputTokens +
			(iteration.tokenUsage.cacheCreationInputTokens || 0) +
			(iteration.tokenUsage.cacheReadInputTokens || 0);
		const total = totalInput + iteration.tokenUsage.outputTokens;
		lines.push(`Total: ${total.toLocaleString()} tokens`);
		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Format evaluation results as markdown
 */
export function formatResultsAsMarkdown(result: EvalResult): string {
	const lines: string[] = [];

	// Header
	lines.push(`# Evaluation Results: ${result.evalName}`);
	lines.push("");

	// Summary metadata
	lines.push("## Summary");
	lines.push("");
	lines.push(`- **Date**: ${new Date(result.timestamp).toLocaleString()}`);
	lines.push(`- **Duration**: ${(result.duration / 1000).toFixed(2)}s`);
	lines.push(`- **Total Runs**: ${result.iterations.length}`);
	lines.push(
		`- **Overall Status**: ${result.success ? "✓ PASSED" : "✗ FAILED"}`,
	);
	if (result.aggregateScores._overall) {
		lines.push(
			`- **Pass Rate**: ${(result.aggregateScores._overall.passRate * 100).toFixed(1)}%`,
		);
	}
	if (result.error) {
		lines.push(`- **Error**: ${result.error}`);
	}
	lines.push("");

	// Per-prompt summary
	const promptStats = perPromptStats(result);
	if (promptStats.length > 1) {
		lines.push("## Prompts Tested");
		lines.push("");
		for (const { promptId, passRate, runs } of promptStats) {
			lines.push(
				`- **${promptId}**: ${(passRate * 100).toFixed(1)}% pass rate (${runs} runs)`,
			);
		}
		lines.push("");
	}

	// Aggregate scores table (exclude _overall)
	const scorerNames = Object.keys(result.aggregateScores).filter(
		(name) => name !== "_overall",
	);
	if (scorerNames.length > 0) {
		lines.push("## Scorer Summary");
		lines.push("");
		lines.push("| Scorer | Pass Rate |");
		lines.push("|--------|-----------|");

		for (const name of scorerNames) {
			const agg = result.aggregateScores[name];
			lines.push(`| ${name} | ${(agg.passRate * 100).toFixed(1)}% |`);
		}
		lines.push("");
	}

	// Per-iteration results table
	if (result.iterations.length > 0) {
		lines.push("## Iteration Results");
		lines.push("");

		// Collect all scorer names from all iterations
		const allScorerNames = new Set<string>();
		for (const iter of result.iterations) {
			for (const scorerName of Object.keys(iter.scores)) {
				allScorerNames.add(scorerName);
			}
		}
		const sortedScorerNames = Array.from(allScorerNames).sort();

		// Build table header
		const header = [
			"| Iteration | Prompt ID | Status | Duration (s) | " +
				sortedScorerNames.join(" | ") +
				" |",
		];
		const separator = [
			"|-----------|-----------|--------|--------------|" +
				sortedScorerNames.map(() => "------").join("|") +
				"|",
		];
		lines.push(header.join(""));
		lines.push(separator.join(""));

		// Build table rows
		for (const iter of result.iterations) {
			const status = iter.success ? "✓ Pass" : "✗ Fail";
			const duration = (iter.duration / 1000).toFixed(2);
			const scores = sortedScorerNames.map((name) => {
				const score = iter.scores[name];
				if (score) {
					return score.score.toFixed(3);
				}
				return "N/A";
			});

			lines.push(
				`| ${iter.iterationId} | ${iter.promptId} | ${status} | ${duration} | ${scores.join(" | ")} |`,
			);
		}
		lines.push("");

		// Add detailed iteration results (reasons for scores)
		lines.push("### Detailed Results");
		lines.push("");
		for (const iter of result.iterations) {
			lines.push(`#### Iteration ${iter.iterationId}`);
			lines.push("");
			if (iter.error) {
				lines.push(`**Error**: ${iter.error}`);
				lines.push("");
			}
			if (Object.keys(iter.scores).length > 0) {
				lines.push("**Scorer Details**:");
				lines.push("");
				for (const [name, score] of Object.entries(iter.scores)) {
					lines.push(`- **${name}**: ${score.score.toFixed(3)}`);
					lines.push(`  - Reason: ${score.reason}`);
					if (score.metadata && Object.keys(score.metadata).length > 0) {
						lines.push(`  - Metadata: ${JSON.stringify(score.metadata)}`);
					}
				}
				lines.push("");
			}
			if (iter.workingDir) {
				lines.push(`**Working Directory**: \`${iter.workingDir}\``);
				lines.push("");
			}
		}
	}

	// Token usage summary
	if (result.tokenUsage) {
		const totalInput =
			result.tokenUsage.inputTokens +
			(result.tokenUsage.cacheCreationInputTokens || 0) +
			(result.tokenUsage.cacheReadInputTokens || 0);
		const total = totalInput + result.tokenUsage.outputTokens;

		lines.push("## Token Usage");
		lines.push("");
		lines.push(`**Total**: ${total.toLocaleString()} tokens`);
		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Escape a string for safe inclusion in XML text or attribute values.
 */
function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * Format evaluation results as JUnit XML.
 *
 * One `<testsuite>` per promptId, one `<testcase>` per iteration. A failed
 * iteration gets a `<failure>` carrying the failing-scorer names + reasons
 * (or the iteration error). The synthetic `_overall` aggregate is excluded.
 */
export function formatResultsAsJUnit(result: EvalResult): string {
	const promptIds = [...new Set(result.iterations.map((i) => i.promptId))];

	const totalTests = result.iterations.length;
	const totalFailures = result.iterations.filter((i) => !i.success).length;
	const totalTime = (result.duration / 1000).toFixed(3);

	const lines: string[] = [];
	lines.push('<?xml version="1.0" encoding="UTF-8"?>');
	lines.push(
		`<testsuites name="${escapeXml(result.evalName)}" tests="${totalTests}" failures="${totalFailures}" time="${totalTime}">`,
	);

	for (const promptId of promptIds) {
		const iterations = result.iterations.filter((i) => i.promptId === promptId);
		const failures = iterations.filter((i) => !i.success).length;
		const suiteTime = (
			iterations.reduce((sum, i) => sum + i.duration, 0) / 1000
		).toFixed(3);

		lines.push(
			`  <testsuite name="${escapeXml(promptId)}" tests="${iterations.length}" failures="${failures}" time="${suiteTime}">`,
		);

		for (const iter of iterations) {
			const caseName = `iteration ${iter.iterationId}`;
			const caseTime = (iter.duration / 1000).toFixed(3);
			const classname = `${result.evalName}.${promptId}`;

			if (iter.success) {
				lines.push(
					`    <testcase name="${escapeXml(caseName)}" classname="${escapeXml(classname)}" time="${caseTime}" />`,
				);
			} else {
				const failingScorers = Object.entries(iter.scores).filter(
					([, s]) => s.score < 1,
				);
				const message =
					failingScorers.length > 0
						? failingScorers.map(([name]) => name).join(", ")
						: (iter.error ?? "iteration failed");
				const bodyParts: string[] = [];
				for (const [name, score] of failingScorers) {
					bodyParts.push(`${name}: ${score.reason}`);
				}
				if (iter.error) {
					bodyParts.push(`error: ${iter.error}`);
				}
				const body = bodyParts.join("\n");

				lines.push(
					`    <testcase name="${escapeXml(caseName)}" classname="${escapeXml(classname)}" time="${caseTime}">`,
				);
				lines.push(
					`      <failure message="${escapeXml(message)}">${escapeXml(body)}</failure>`,
				);
				lines.push("    </testcase>");
			}
		}

		lines.push("  </testsuite>");
	}

	lines.push("</testsuites>");
	return `${lines.join("\n")}\n`;
}

/**
 * Format evaluation results as a compact GitHub Step Summary (Markdown).
 *
 * Intended to be appended to `$GITHUB_STEP_SUMMARY`. Contains status, overall
 * pass rate, a per-prompt breakdown, and a per-scorer breakdown. No tokens, no
 * API calls. The synthetic `_overall` aggregate is excluded from the scorer
 * table (its pass rate is surfaced as the headline instead).
 */
export function formatResultsAsGitHubSummary(result: EvalResult): string {
	const lines: string[] = [];

	const overallPassRate = result.aggregateScores._overall?.passRate;
	const statusIcon = result.success ? "✅" : "❌";
	const statusLabel = result.success ? "PASSED" : "FAILED";

	lines.push(`## ${statusIcon} Eval: ${result.evalName} — ${statusLabel}`);
	lines.push("");

	const passedCount = result.iterations.filter((i) => i.success).length;
	const total = result.iterations.length;
	lines.push(`- **Status**: ${statusLabel}`);
	if (overallPassRate !== undefined) {
		lines.push(`- **Pass Rate**: ${(overallPassRate * 100).toFixed(1)}%`);
	}
	lines.push(`- **Iterations**: ${passedCount}/${total} passed`);
	lines.push(`- **Duration**: ${(result.duration / 1000).toFixed(2)}s`);
	if (result.error) {
		lines.push(`- **Error**: ${result.error}`);
	}
	lines.push("");

	// Per-prompt breakdown
	lines.push("### Prompts");
	lines.push("");
	lines.push("| Prompt | Pass Rate | Runs |");
	lines.push("|--------|-----------|------|");
	for (const { promptId, passRate, runs } of perPromptStats(result)) {
		lines.push(
			`| ${escapeMarkdownCell(promptId)} | ${(passRate * 100).toFixed(1)}% | ${runs} |`,
		);
	}
	lines.push("");

	// Per-scorer breakdown (exclude _overall)
	const scorerNames = Object.keys(result.aggregateScores).filter(
		(name) => name !== "_overall",
	);
	if (scorerNames.length > 0) {
		lines.push("### Scorers");
		lines.push("");
		lines.push("| Scorer | Pass Rate |");
		lines.push("|--------|-----------|");
		for (const name of scorerNames) {
			const agg = result.aggregateScores[name];
			lines.push(
				`| ${escapeMarkdownCell(name)} | ${(agg.passRate * 100).toFixed(1)}% |`,
			);
		}
		lines.push("");
	}

	return `${lines.join("\n")}\n`;
}

/**
 * Format evaluation results as a pretty-printed JSON string. Single source of
 * truth for the on-disk JSON shape.
 */
export function formatResultsAsJson(result: EvalResult): string {
	return JSON.stringify(result, null, 2);
}

/**
 * Write evaluation results as JSON file
 * @param result - The evaluation result to write
 * @param filePath - Path where JSON should be written
 */
export async function writeResultsAsJson(
	result: EvalResult,
	filePath: string,
): Promise<void> {
	await fs.writeFile(filePath, formatResultsAsJson(result), "utf-8");
}

/**
 * Write evaluation results to a directory with structured output
 * @param result - The evaluation result to write
 * @param outputDir - Base directory where results should be written
 * @returns The path to the created directory
 */
export async function writeResults(
	result: EvalResult,
	outputDir: string,
): Promise<string> {
	// Ensure base output directory exists
	await fs.ensureDir(outputDir);

	// Generate directory name: {evalName}-{timestamp}
	const sanitizedName = sanitizeForFilename(result.evalName);
	const formattedTimestamp = formatTimestampForFilename(result.timestamp);
	const dirName = `${sanitizedName}-${formattedTimestamp}`;
	const dirPath = path.join(outputDir, dirName);

	// Create the results directory
	await fs.ensureDir(dirPath);

	// Write aggregate results.md
	const resultsMarkdown = formatResultsAsMarkdown(result);
	await fs.writeFile(
		path.join(dirPath, "results.md"),
		resultsMarkdown,
		"utf-8",
	);

	// Write results.json
	await writeResultsAsJson(result, path.join(dirPath, "results.json"));

	// Write per-iteration logs
	for (const iteration of result.iterations) {
		const logContent = formatIterationLog(iteration);
		const logFilename = `iteration-${iteration.promptId}-${iteration.iterationId}.log`;
		await fs.writeFile(path.join(dirPath, logFilename), logContent, "utf-8");
	}

	return dirPath;
}

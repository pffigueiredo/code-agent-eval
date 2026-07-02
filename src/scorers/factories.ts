import { execa } from "execa";
import type { ExecCommandOptions, ScorerResult } from "../types";

/** Clamp a scorer score into [0, 1]. Non-finite maps to 0, except +Infinity → 1. */
export function clampScore(score: number): number {
	if (!Number.isFinite(score)) return score === Infinity ? 1 : 0;
	return Math.max(0, Math.min(1, score));
}

export function tryParseScore(stdout: string): ScorerResult | null {
	const trimmed = stdout.trim();
	if (!trimmed.startsWith("{")) return null;
	try {
		const o = JSON.parse(trimmed);
		if (typeof o.score === "number") {
			return {
				score: clampScore(o.score),
				reason: typeof o.reason === "string" ? o.reason : "command score",
				metadata: o.metadata,
			};
		}
	} catch {
		/* not JSON — fall through */
	}
	return null;
}

/**
 * Builds the execCommand utility function that gets injected into ScorerContext.
 * This is used internally by the runner to provide command execution capabilities.
 *
 * @internal
 */
export function buildExecCommand(workingDir: string) {
	return async (options: ExecCommandOptions): Promise<ScorerResult> => {
		const {
			command,
			args,
			timeout = 120000, // Default 2 minutes
			successMessage,
			failureMessage,
		} = options;

		try {
			const { stdout } = await execa(command, args, {
				cwd: workingDir,
				timeout,
			});
			const parsed = tryParseScore(stdout);
			if (parsed) return parsed;
			return {
				score: 1.0,
				reason: successMessage || `${command} ${args.join(" ")} passed`,
			};
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			return {
				score: 0.0,
				reason: failureMessage
					? `${failureMessage}: ${errorMessage}`
					: `${command} ${args.join(" ")} failed: ${errorMessage}`,
			};
		}
	};
}

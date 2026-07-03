import { z } from "zod";

/** All scalar EvalConfig fields — shared by the TS and JSON config schemas. */
const baseConfigShape = {
	name: z.string(),
	prompts: z
		.array(z.object({ id: z.string(), prompt: z.string() }).strict())
		.nonempty(),
	projectDir: z.string(),
	iterations: z.number().int().positive().optional(),
	execution: z
		.object({
			mode: z.enum(["sequential", "parallel", "parallel-limit"]),
			concurrency: z.number().int().positive().optional(),
		})
		.strict()
		.optional(),
	timeout: z.number().positive().optional(),
	verbose: z.boolean().optional(),
	tempDirCleanup: z.enum(["always", "on-failure", "never"]).optional(),
	resultsDir: z.string().optional(),
	passThreshold: z.number().min(0).max(1).optional(),
	installDependencies: z.boolean().optional(),
	agentId: z.string().optional(),
	claudeCodeOptions: z.record(z.string(), z.unknown()).optional(),
} as const;

/** Recursive scorer spec union. */
export type ScorerSpec =
	| { type: "build"; name?: string }
	| { type: "test"; name?: string }
	| { type: "lint"; name?: string }
	| {
			type: "command";
			name: string;
			command: string;
			args?: string[];
			timeout?: number;
			successMessage?: string;
			failureMessage?: string;
	  }
	| { type: "skill-picked-up"; skill: string; name?: string }
	| {
			type: "file";
			name?: string;
			path: string;
			exists?: boolean;
			contains?: string;
			matches?: string;
			jsonPath?: { path: string; equals: unknown };
	  }
	| {
			type: "diff-contains";
			name?: string;
			pattern: string;
			expect?: "present" | "absent";
			flags?: string;
	  }
	| { type: "all"; name?: string; of: ScorerSpec[] }
	| { type: "any"; name?: string; of: ScorerSpec[] }
	| { type: "script"; name: string; path: string };

const scorerSpecSchema: z.ZodType<ScorerSpec> = z.discriminatedUnion("type", [
	z.object({ type: z.literal("build"), name: z.string().optional() }).strict(),
	z.object({ type: z.literal("test"), name: z.string().optional() }).strict(),
	z.object({ type: z.literal("lint"), name: z.string().optional() }).strict(),
	z
		.object({
			type: z.literal("command"),
			name: z.string(),
			command: z.string(),
			args: z.array(z.string()).optional(),
			timeout: z.number().optional(),
			successMessage: z.string().optional(),
			failureMessage: z.string().optional(),
		})
		.strict(),
	z
		.object({
			type: z.literal("skill-picked-up"),
			skill: z.string(),
			name: z.string().optional(),
		})
		.strict(),
	z
		.object({
			type: z.literal("file"),
			name: z.string().optional(),
			path: z.string(),
			exists: z.boolean().optional(),
			contains: z.string().optional(),
			matches: z.string().optional(),
			jsonPath: z
				.object({ path: z.string(), equals: z.unknown() })
				.strict()
				.optional(),
		})
		.strict()
		.refine(
			(s) =>
				s.exists != null ||
				s.contains != null ||
				s.matches != null ||
				s.jsonPath != null,
			{
				message:
					"file scorer requires at least one of exists/contains/matches/jsonPath",
			},
		),
	z
		.object({
			type: z.literal("diff-contains"),
			name: z.string().optional(),
			pattern: z.string(),
			expect: z.enum(["present", "absent"]).default("present"),
			flags: z.string().optional(),
		})
		.strict(),
	z
		.object({
			type: z.literal("all"),
			name: z.string().optional(),
			of: z.array(z.lazy(() => scorerSpecSchema)).nonempty(),
		})
		.strict(),
	z
		.object({
			type: z.literal("any"),
			name: z.string().optional(),
			of: z.array(z.lazy(() => scorerSpecSchema)).nonempty(),
		})
		.strict(),
	z
		.object({ type: z.literal("script"), name: z.string(), path: z.string() })
		.strict(),
]);

export type FileScorerSpec = Extract<ScorerSpec, { type: "file" }>;
export type DiffScorerSpec = Extract<ScorerSpec, { type: "diff-contains" }>;
export type ScriptScorerSpec = Extract<ScorerSpec, { type: "script" }>;

/** TS path: scorers are functions. */
export const evalConfigSchema = z.object({
	...baseConfigShape,
	scorers: z
		.array(
			z.custom<{ name: string; evaluate: (...args: never) => unknown }>(
				(v) => {
					const s = v as { name?: unknown; evaluate?: unknown };
					return (
						typeof s === "object" &&
						s !== null &&
						typeof s.name === "string" &&
						typeof s.evaluate === "function"
					);
				},
				{
					message:
						"Each scorer must have a string `name` and a function `evaluate`",
				},
			),
		)
		.optional(),
	environmentVariables: z
		.union([
			z.record(z.string(), z.string()),
			z.custom<(...args: never) => unknown>((v) => typeof v === "function"),
		])
		.optional(),
});

/** JSON path: scorers are structural specs; $schema key permitted + ignored. */
export const jsonConfigSchema = z
	.object({
		$schema: z.string().optional(),
		...baseConfigShape,
		scorers: z.array(scorerSpecSchema).optional(),
		environmentVariables: z.record(z.string(), z.string()).optional(),
	})
	.strict();

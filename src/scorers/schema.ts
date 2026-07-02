import { z } from 'zod';

/** All scalar EvalConfig fields — shared by the TS and JSON config schemas. */
export const baseConfigShape = {
  name: z.string(),
  prompts: z.array(z.object({ id: z.string(), prompt: z.string() }).strict()).nonempty(),
  projectDir: z.string(),
  iterations: z.number().int().positive().optional(),
  execution: z
    .object({
      mode: z.enum(['sequential', 'parallel', 'parallel-limit']),
      concurrency: z.number().int().positive().optional(),
    })
    .strict()
    .optional(),
  timeout: z.number().positive().optional(),
  verbose: z.boolean().optional(),
  tempDirCleanup: z.enum(['always', 'on-failure', 'never']).optional(),
  resultsDir: z.string().optional(),
  installDependencies: z.boolean().optional(),
  agentId: z.string().optional(),
  claudeCodeOptions: z.record(z.string(), z.unknown()).optional(),
} as const;

/** Phase-1 scorer specs (extended in later phases). */
export const scorerSpecSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('build'), name: z.string().optional() }).strict(),
  z.object({ type: z.literal('test'), name: z.string().optional() }).strict(),
  z.object({ type: z.literal('lint'), name: z.string().optional() }).strict(),
  z
    .object({
      type: z.literal('command'),
      name: z.string(),
      command: z.string(),
      args: z.array(z.string()).optional(),
      timeout: z.number().optional(),
      successMessage: z.string().optional(),
      failureMessage: z.string().optional(),
    })
    .strict(),
]);
export type ScorerSpec = z.infer<typeof scorerSpecSchema>;

/** TS path: scorers are functions (existing z.custom form). */
export const evalConfigSchema = z.object({
  ...baseConfigShape,
  scorers: z
    .array(
      z.custom<{ name: string; evaluate: Function }>(
        (v) =>
          typeof v === 'object' &&
          v !== null &&
          typeof (v as any).name === 'string' &&
          typeof (v as any).evaluate === 'function',
        { message: 'Each scorer must have a string `name` and a function `evaluate`' }
      )
    )
    .optional(),
  environmentVariables: z
    .union([
      z.record(z.string(), z.string()),
      z.custom<Function>((v) => typeof v === 'function'),
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

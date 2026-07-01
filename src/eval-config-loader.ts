import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { z } from 'zod';
import type { EvalConfig } from './runner';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

/** Eval scripts: TS/JS extensions that may import npm packages (needs jiti + alias). */
const EVAL_SCRIPT_RE = /\.([mc]?tsx?|[mc]?jsx?)$/i;

export const evalConfigSchema = z.object({
  name: z.string(),
  prompts: z
    .array(z.object({ id: z.string(), prompt: z.string() }))
    .nonempty(),
  projectDir: z.string(),
  iterations: z.number().int().positive().optional(),
  execution: z
    .object({
      mode: z.enum(['sequential', 'parallel', 'parallel-limit']),
      concurrency: z.number().int().positive().optional(),
    })
    .optional(),
  timeout: z.number().positive().optional(),
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
  verbose: z.boolean().optional(),
  tempDirCleanup: z.enum(['always', 'on-failure', 'never']).optional(),
  resultsDir: z.string().optional(),
  installDependencies: z.boolean().optional(),
  environmentVariables: z
    .union([
      z.record(z.string(), z.string()),
      z.custom<Function>((v) => typeof v === 'function'),
    ])
    .optional(),
  agentId: z.string().optional(),
  claudeCodeOptions: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Entry file for this package, from the CLI module's perspective.
 * Ensures eval files can `import from 'code-agent-eval'` under `npx` without a project-local install.
 */
export function resolveLibraryEntry(): string {
  try {
    return require.resolve('code-agent-eval');
  } catch {
    return path.join(__dirname, 'index.js');
  }
}

export async function loadEvalFile(filePath: string): Promise<EvalConfig> {
  const resolved = path.resolve(filePath);

  let mod: { default?: unknown; config?: unknown };
  if (EVAL_SCRIPT_RE.test(resolved)) {
    const { createJiti } = await import('jiti');
    const jiti = createJiti(import.meta.url, {
      alias: {
        'code-agent-eval': resolveLibraryEntry(),
      },
    });
    mod = (await jiti.import(resolved)) as typeof mod;
  } else {
    mod = (await import(resolved)) as typeof mod;
  }

  const raw = mod.default ?? mod.config;
  if (!raw) {
    throw new Error(
      'Eval file must export a default or named "config" EvalConfig object'
    );
  }

  const parsed = evalConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid eval config:\n${issues}`);
  }

  return parsed.data as EvalConfig;
}

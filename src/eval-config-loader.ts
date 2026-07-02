import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { EvalConfig } from './runner';
import { evalConfigSchema, jsonConfigSchema } from './scorers/schema';
import type { ScriptScorerSpec, ScorerSpec } from './scorers/schema';
import { compileScorer } from './scorers/registry';

export { evalConfigSchema }; // back-compat: tests import from here

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

/** Eval scripts: TS/JS extensions that may import npm packages (needs jiti + alias). */
const EVAL_SCRIPT_RE = /\.([mc]?tsx?|[mc]?jsx?)$/i;

/**
 * Entry file for this package, from the CLI module's perspective.
 * Ensures eval files can `import from 'code-agent-eval'` under `npx` without a project-local install.
 */
export function resolveLibraryEntry(): string {
  try {
    return require.resolve('code-agent-eval');
  } catch {
    return path.join(__dirname, 'index.mjs');
  }
}

function formatIssues(error: { issues: { path: PropertyKey[]; message: string }[] }): string {
  return error.issues.map((i) => `  - ${i.path.map(String).join('.')}: ${i.message}`).join('\n');
}

/** Rewrite `script.path` from relative (to config file dir) to absolute. `file.path` stays relative. */
function resolveScriptPath(spec: ScorerSpec, configDir: string): ScorerSpec {
  if (spec.type === 'script' && !path.isAbsolute(spec.path)) {
    return { ...spec, path: path.resolve(configDir, spec.path) };
  }
  if (spec.type === 'all' || spec.type === 'any') {
    return { ...spec, of: spec.of.map((s) => resolveScriptPath(s, configDir)) };
  }
  return spec;
}

/** Collect all script scorer specs from a JSON eval file, with absolute paths. */
export async function collectScriptScorers(filePath: string): Promise<ScriptScorerSpec[]> {
  const resolved = path.resolve(filePath);
  const raw = JSON.parse(await readFile(resolved, 'utf8'));
  const parsed = jsonConfigSchema.safeParse(raw);
  if (!parsed.success) return [];
  const configDir = path.dirname(resolved);
  const specs = parsed.data.scorers ?? [];
  return collectScriptSpecsDeep(specs, configDir);
}

function collectScriptSpecsDeep(specs: ScorerSpec[], configDir: string): ScriptScorerSpec[] {
  const results: ScriptScorerSpec[] = [];
  for (const spec of specs) {
    if (spec.type === 'script') {
      const absPath = path.isAbsolute(spec.path) ? spec.path : path.resolve(configDir, spec.path);
      results.push({ ...spec, path: absPath });
    } else if (spec.type === 'all' || spec.type === 'any') {
      results.push(...collectScriptSpecsDeep(spec.of, configDir));
    }
  }
  return results;
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
  } else if (/\.jsonl?$/i.test(resolved)) {
    const raw = JSON.parse(await readFile(resolved, 'utf8'));
    const parsed = jsonConfigSchema.safeParse(raw);
    if (!parsed.success) throw new Error(`Invalid eval config:\n${formatIssues(parsed.error)}`);
    const configDir = path.dirname(resolved);
    const { $schema: _schema, scorers, ...rest } = parsed.data;
    const resolvedSpecs = scorers?.map((s) => resolveScriptPath(s, configDir));
    return { ...rest, scorers: resolvedSpecs?.map(compileScorer) } as EvalConfig;
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
    throw new Error(`Invalid eval config:\n${formatIssues(parsed.error)}`);
  }

  return parsed.data as EvalConfig;
}

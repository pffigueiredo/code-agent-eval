import { parseArgs, format } from 'node:util';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { detectAgenticEnvironment } from 'am-i-vibing';
import { runClaudeCodeEval } from './runner';
import type { EvalConfig } from './runner';
import { loadEvalFile } from './eval-config-loader';
import { resolveOutputMode } from './agent-detect';
import type { AgentDetectionResult } from './agent-detect';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { version } = require('../package.json');

// Semantic exit codes
const EXIT = {
  SUCCESS: 0,
  EVAL_FAILURE: 1,
  USAGE: 2,
  CONFIG: 78,
} as const;

// stdout helpers — never affected by console.log override
function stdout(text: string): void {
  process.stdout.write(text + '\n');
}

function stdoutJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

const help = `code-agent-eval v${version} - Evaluate coding agents with structured evals

Usage: code-agent-eval --eval-file <path> [options]

Options:
  --eval-file <path>     Path to eval config file (.ts/.js)
  --iterations <n>       Override iteration count
  --verbose              Enable verbose logging
  --results-dir <path>   Override results directory
  --json                 Output results as JSON to stdout
  --dry-run              Validate config and show execution plan
  --show-skill           Print agent skill guide (eval config format, scorers, examples)
  --no-agent-detect      Disable automatic AI agent detection
  --help                 Show help
  --version              Show version

Environment variables:
  CODE_AGENT_EVAL_ITERATIONS     Override iteration count
  CODE_AGENT_EVAL_VERBOSE        Set to "1" or "true" for verbose
  CODE_AGENT_EVAL_RESULTS_DIR    Override results directory
  CODE_AGENT_EVAL_AGENT_DETECT   Set to "0" to disable agent detection

Examples:
  $ code-agent-eval --eval-file ./evals/health-check.ts
  $ code-agent-eval --eval-file ./evals/refactor.ts --iterations 5
  $ code-agent-eval --eval-file ./evals/refactor.ts --dry-run
  $ code-agent-eval --eval-file ./evals/refactor.ts --json > results.json
  $ code-agent-eval --eval-file ./evals/refactor.ts --results-dir ./out
`;

// --- Main ---

async function main() {
  let values: Record<string, any>;
  try {
    ({ values } = parseArgs({
      options: {
        'eval-file': { type: 'string' },
        iterations: { type: 'string' },
        verbose: { type: 'boolean', default: false },
        'results-dir': { type: 'string' },
        json: { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        'agent-detect': { type: 'boolean', default: true },
        'show-skill': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
        version: { type: 'boolean', default: false },
      },
      strict: true,
      allowNegative: true,
    }));
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
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

  if (values['show-skill']) {
    try {
      const skillPath = path.join(__dirname, '..', 'SKILL.md');
      const content = readFileSync(skillPath, 'utf-8');
      process.stdout.write(content);
    } catch {
      console.error('Error: SKILL.md not found');
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
    agentDetectFlag: values['agent-detect'] as boolean,
    agentDetectEnv: process.env.CODE_AGENT_EVAL_AGENT_DETECT,
    detection,
  });

  // Route runner's console.log to stderr so stdout stays clean for data output.
  // console.error already writes to stderr — no override needed.
  console.log = (...args: any[]) => {
    process.stderr.write(format(...args) + '\n');
  };

  if (!values['eval-file']) {
    if (isJson) {
      stdoutJson({
        status: 'error',
        agentDetection,
        error: {
          code: 'MISSING_EVAL_FILE',
          message: '--eval-file <path> is required',
          fix: 'code-agent-eval --eval-file <path>',
          transient: false,
        },
      });
    } else {
      console.error('Error: --eval-file <path> is required');
      console.error('Run "code-agent-eval --help" for usage.');
    }
    process.exit(EXIT.USAGE);
  }

  let config: EvalConfig;
  try {
    config = await loadEvalFile(values['eval-file'] as string);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isJson) {
      stdoutJson({
        status: 'error',
        agentDetection,
        error: {
          code: 'CONFIG_INVALID',
          message: msg,
          fix: `Check eval file: ${values['eval-file']}`,
          transient: false,
        },
      });
    } else {
      console.error(`Error: Failed to load eval file: ${values['eval-file']}`);
      console.error(msg);
      console.error('\nFix: Ensure the file exports a valid EvalConfig object.');
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
          status: 'error',
          agentDetection,
          error: {
            code: 'INVALID_ARG',
            message: '--iterations must be a positive integer',
            transient: false,
          },
        });
      } else {
        console.error('Error: --iterations must be a positive integer');
      }
      process.exit(EXIT.USAGE);
    }
    overrides.iterations = n;
  } else if (iterEnv) {
    const n = parseInt(iterEnv, 10);
    if (!Number.isNaN(n) && n >= 1) overrides.iterations = n;
  }

  if (
    values.verbose ||
    ['1', 'true'].includes(process.env.CODE_AGENT_EVAL_VERBOSE ?? '')
  ) {
    overrides.verbose = true;
  }

  const rdir =
    (values['results-dir'] as string | undefined) ??
    process.env.CODE_AGENT_EVAL_RESULTS_DIR;
  if (rdir) overrides.resultsDir = rdir;

  const finalConfig = { ...config, ...overrides };
  const iterations = finalConfig.iterations ?? 1;
  const totalRuns = finalConfig.prompts.length * iterations;
  const execMode = finalConfig.execution?.mode ?? 'sequential';

  // --dry-run: validate config and show plan without running
  if (values['dry-run']) {
    const plan = {
      name: finalConfig.name,
      prompts: finalConfig.prompts.map((p) => p.id),
      iterations,
      totalRuns,
      execution: execMode,
      scorers: (finalConfig.scorers ?? []).map((s) => s.name),
      resultsDir: finalConfig.resultsDir ?? null,
      projectDir: path.resolve(finalConfig.projectDir),
    };

    if (isJson) {
      stdoutJson({ status: 'ok', agentDetection, data: plan });
    } else {
      stdout(
        `Config valid. Would run ${totalRuns} eval(s) for "${plan.name}".`
      );
      stdout('');
      stdout(`  Eval:       ${plan.name}`);
      stdout(`  Prompts:    ${plan.prompts.join(', ')}`);
      stdout(`  Iterations: ${iterations}`);
      stdout(`  Total runs: ${totalRuns}`);
      stdout(`  Execution:  ${execMode}`);
      stdout(
        `  Scorers:    ${plan.scorers.length ? plan.scorers.join(', ') : '(none)'}`
      );
      stdout(`  Results:    ${plan.resultsDir ?? '(not configured)'}`);
      stdout(`  Project:    ${plan.projectDir}`);
    }
    process.exit(EXIT.SUCCESS);
  }

  // Run eval
  const result = await runClaudeCodeEval(finalConfig);

  // Output results
  const evalFile = values['eval-file'];

  if (isJson) {
    stdoutJson({
      status: result.success ? 'ok' : 'error',
      agentDetection,
      data: {
        evalName: result.evalName,
        agentId: result.agentId,
        timestamp: result.timestamp,
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
    const passRate = (result.aggregateScores._overall?.passRate ?? 0) * 100;
    const passed = result.iterations.filter((i) => i.success).length;
    const total = result.iterations.length;
    const durSec = (result.duration / 1000).toFixed(1);

    stdout('');
    stdout(
      `Eval "${result.evalName}" ${result.success ? 'completed' : 'failed'}: ${passed}/${total} passed (${passRate.toFixed(1)}%) in ${durSec}s`
    );
    stdout('');
    stdout('Next steps:');
    if (result.success) {
      if (finalConfig.resultsDir) {
        stdout(
          `  View results:    cat ${finalConfig.resultsDir}/*/results.md`
        );
      }
      stdout(
        `  Export as JSON:  code-agent-eval --eval-file ${evalFile} --json`
      );
      stdout(
        `  More iterations: code-agent-eval --eval-file ${evalFile} --iterations ${iterations * 2}`
      );
    } else {
      stdout(
        `  Re-run verbose:  code-agent-eval --eval-file ${evalFile} --verbose`
      );
      stdout(
        `  Export details:  code-agent-eval --eval-file ${evalFile} --json`
      );
      const preserved = result.iterations.filter((i) => i.workingDir);
      if (preserved.length > 0) {
        stdout(`  Inspect temp:    cd ${preserved[0].workingDir}`);
      }
    }
  }

  process.exit(result.success ? EXIT.SUCCESS : EXIT.EVAL_FAILURE);
}

main().catch((err) => {
  const isJson = process.argv.includes('--json');
  if (isJson) {
    stdoutJson({
      status: 'error',
      error: {
        code: 'FATAL',
        message: err instanceof Error ? err.message : String(err),
        transient: false,
      },
    });
  } else {
    console.error('Fatal error:', err);
  }
  process.exit(1);
});

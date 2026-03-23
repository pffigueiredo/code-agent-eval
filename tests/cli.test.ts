import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveOutputMode } from '../src/agent-detect';

const CLI = path.resolve('dist/cli.js');
const EVAL_FILE = path.resolve('examples/cli-test.ts');

// Helper: run CLI and return stdout, stderr, exitCode (never throws on non-zero)
async function run(
  args: string[],
  env?: Record<string, string>
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execa('node', [CLI, ...args], {
      env: { ...process.env, ...env },
      reject: false,
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } catch (err: any) {
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', exitCode: err.exitCode ?? 1 };
  }
}

describe('CLI: --version', () => {
  it('prints version to stdout and exits 0', async () => {
    const { stdout, exitCode } = await run(['--version']);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('CLI: --help', () => {
  it('prints help to stdout and exits 0', async () => {
    const { stdout, exitCode } = await run(['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('--eval-file');
    expect(stdout).toContain('Examples:');
    expect(stdout).toContain('Environment variables:');
  });

  it('includes --show-skill and --no-agent-detect in help', async () => {
    const { stdout } = await run(['--help']);
    expect(stdout).toContain('--show-skill');
    expect(stdout).toContain('--no-agent-detect');
    expect(stdout).toContain('CODE_AGENT_EVAL_AGENT_DETECT');
  });
});

describe('CLI: --show-skill', () => {
  it('outputs SKILL.md content and exits 0', async () => {
    const { stdout, exitCode } = await run(['--show-skill']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('code-agent-eval');
    expect(stdout).toContain('Eval config format');
    expect(stdout).toContain('Scorer interface');
  });
});

describe('CLI: exit codes', () => {
  it('exits 2 when --eval-file is missing', async () => {
    const { exitCode, stderr } = await run([], { CLAUDECODE: '' });
    expect(exitCode).toBe(2);
    expect(stderr).toContain('--eval-file');
  });

  it('exits 2 on unknown flag', async () => {
    const { exitCode } = await run(['--nope']);
    expect(exitCode).toBe(2);
  });

  it('exits 2 on invalid --iterations', async () => {
    const { exitCode } = await run([
      '--eval-file', EVAL_FILE,
      '--iterations', '-5',
      '--no-agent-detect',
    ]);
    expect(exitCode).toBe(2);
  });

  it('exits 78 on bad config file', async () => {
    const { exitCode, stderr } = await run([
      '--eval-file', './nonexistent.ts',
      '--no-agent-detect',
    ]);
    expect(exitCode).toBe(78);
    expect(stderr).toContain('Fix:');
  });
});

describe('CLI: --json error output', () => {
  it('returns structured error for missing --eval-file', async () => {
    const { stdout, exitCode } = await run(['--json']);
    expect(exitCode).toBe(2);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('error');
    expect(parsed.error.code).toBe('MISSING_EVAL_FILE');
    expect(parsed.error.fix).toBeDefined();
    expect(parsed.error.transient).toBe(false);
    expect(parsed.agentDetection).toBeDefined();
  });

  it('returns structured error for bad config', async () => {
    const { stdout, exitCode } = await run([
      '--json',
      '--eval-file', './nonexistent.ts',
    ]);
    expect(exitCode).toBe(78);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('error');
    expect(parsed.error.code).toBe('CONFIG_INVALID');
    expect(parsed.agentDetection).toBeDefined();
  });

  it('returns structured error for invalid --iterations', async () => {
    const { stdout, exitCode } = await run([
      '--json',
      '--eval-file', EVAL_FILE,
      '--iterations', 'abc',
    ]);
    expect(exitCode).toBe(2);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('error');
    expect(parsed.error.code).toBe('INVALID_ARG');
    expect(parsed.agentDetection).toBeDefined();
  });
});

describe('CLI: eval file imports code-agent-eval (npx-style)', () => {
  it('loads .ts eval that imports package with cwd lacking local install', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cae-npx-'));
    const evalPath = path.join(dir, 'eval.ts');
    fs.writeFileSync(
      evalPath,
      `import { scorers } from 'code-agent-eval';

export default {
  name: 'npx-alias-test',
  prompts: [{ id: 'v1', prompt: 'noop' }],
  projectDir: '.',
  iterations: 1,
  installDependencies: false,
  scorers: [scorers.buildSuccess()],
};
`,
      'utf-8'
    );
    try {
      const { stdout, stderr, exitCode } = await execa(
        'node',
        [CLI, '--dry-run', '--eval-file', evalPath, '--no-agent-detect'],
        {
          cwd: dir,
          env: { ...process.env, CLAUDECODE: '' },
          reject: false,
        }
      );
      expect(exitCode, stderr).toBe(0);
      expect(stdout).toContain('npx-alias-test');
      expect(stdout).toContain('build');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('loads .mjs eval that imports package with cwd lacking local install', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cae-npx-'));
    const evalPath = path.join(dir, 'eval.mjs');
    fs.writeFileSync(
      evalPath,
      `import { scorers } from 'code-agent-eval';

export default {
  name: 'npx-alias-mjs',
  prompts: [{ id: 'v1', prompt: 'noop' }],
  projectDir: '.',
  iterations: 1,
  installDependencies: false,
  scorers: [scorers.buildSuccess()],
};
`,
      'utf-8'
    );
    try {
      const { stdout, stderr, exitCode } = await execa(
        'node',
        [CLI, '--dry-run', '--eval-file', evalPath, '--no-agent-detect'],
        {
          cwd: dir,
          env: { ...process.env, CLAUDECODE: '' },
          reject: false,
        }
      );
      expect(exitCode, stderr).toBe(0);
      expect(stdout).toContain('npx-alias-mjs');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('CLI: --dry-run', () => {
  it('validates config and exits 0', async () => {
    const { stdout, exitCode } = await run([
      '--dry-run',
      '--eval-file', EVAL_FILE,
      '--no-agent-detect',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Config valid');
    expect(stdout).toContain('cli-test');
  });

  it('shows plan details', async () => {
    const { stdout } = await run([
      '--dry-run',
      '--eval-file', EVAL_FILE,
      '--no-agent-detect',
    ]);
    expect(stdout).toContain('Eval:');
    expect(stdout).toContain('Prompts:');
    expect(stdout).toContain('Iterations:');
    expect(stdout).toContain('Scorers:');
  });

  it('returns JSON plan with --json', async () => {
    const { stdout, exitCode } = await run([
      '--dry-run',
      '--json',
      '--eval-file', EVAL_FILE,
    ]);
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.data.name).toBe('cli-test');
    expect(parsed.data.prompts).toEqual(['v1']);
    expect(parsed.data.totalRuns).toBe(1);
    expect(parsed.data.scorers).toEqual(['build']);
    expect(parsed.agentDetection).toBeDefined();
  });

  it('respects --iterations override in plan', async () => {
    const { stdout } = await run([
      '--dry-run',
      '--json',
      '--eval-file', EVAL_FILE,
      '--iterations', '7',
    ]);
    const parsed = JSON.parse(stdout);
    expect(parsed.data.iterations).toBe(7);
    expect(parsed.data.totalRuns).toBe(7);
  });
});

describe('CLI: env var overrides', () => {
  it('CODE_AGENT_EVAL_ITERATIONS overrides config', async () => {
    const { stdout } = await run(
      ['--dry-run', '--json', '--eval-file', EVAL_FILE],
      { CODE_AGENT_EVAL_ITERATIONS: '12' }
    );
    const parsed = JSON.parse(stdout);
    expect(parsed.data.iterations).toBe(12);
  });

  it('flag takes precedence over env var', async () => {
    const { stdout } = await run(
      ['--dry-run', '--json', '--eval-file', EVAL_FILE, '--iterations', '3'],
      { CODE_AGENT_EVAL_ITERATIONS: '12' }
    );
    const parsed = JSON.parse(stdout);
    expect(parsed.data.iterations).toBe(3);
  });

  it('CODE_AGENT_EVAL_RESULTS_DIR overrides config', async () => {
    const { stdout } = await run(
      ['--dry-run', '--json', '--eval-file', EVAL_FILE],
      { CODE_AGENT_EVAL_RESULTS_DIR: '/tmp/my-results' }
    );
    const parsed = JSON.parse(stdout);
    expect(parsed.data.resultsDir).toBe('/tmp/my-results');
  });
});

describe('CLI: stdout/stderr separation', () => {
  it('--version outputs only to stdout', async () => {
    const { stdout, stderr } = await run(['--version']);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
    expect(stderr).toBe('');
  });

  it('errors go to stderr in non-json mode', async () => {
    const { stdout, stderr, exitCode } = await run([], { CLAUDECODE: '' });
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Error');
    expect(stdout).toBe('');
  });

  it('errors go to stdout as JSON in --json mode', async () => {
    const { stdout, exitCode } = await run(['--json']);
    expect(exitCode).toBe(2);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('error');
  });

  it('--dry-run plan goes to stdout', async () => {
    const { stdout, stderr } = await run([
      '--dry-run',
      '--eval-file', EVAL_FILE,
      '--no-agent-detect',
    ]);
    expect(stdout).toContain('Config valid');
    // stderr should be empty (no runner progress in dry-run)
    expect(stderr).toBe('');
  });
});

describe('CLI: agent detection', () => {
  it('auto-detects agent and returns JSON', async () => {
    const { stdout, exitCode } = await run(
      ['--dry-run', '--eval-file', EVAL_FILE],
      { CLAUDECODE: '1' }
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.agentDetection.type).toBe('agent');
    expect(parsed.agentDetection.id).toBe('claude-code');
    expect(parsed.agentDetection.disabled).toBe(false);
  });

  it('agent + --json is idempotent', async () => {
    const { stdout, exitCode } = await run(
      ['--dry-run', '--json', '--eval-file', EVAL_FILE],
      { CLAUDECODE: '1' }
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.status).toBe('ok');
    expect(parsed.agentDetection.type).toBe('agent');
  });

  it('--no-agent-detect gives human output despite agent env', async () => {
    const { stdout, exitCode } = await run(
      ['--dry-run', '--eval-file', EVAL_FILE, '--no-agent-detect'],
      { CLAUDECODE: '1' }
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Config valid');
    // Should NOT be JSON
    expect(() => JSON.parse(stdout)).toThrow();
  });

  it('interactive env does not trigger auto-JSON', async () => {
    // CURSOR_TRACE_ID alone = interactive type, not agent
    const { stdout, exitCode } = await run(
      ['--dry-run', '--eval-file', EVAL_FILE],
      { CURSOR_TRACE_ID: 'test-trace-id', CLAUDECODE: '' }
    );
    expect(exitCode).toBe(0);
    // Should be human-readable, not JSON
    expect(stdout).toContain('Config valid');
  });

  it('no agent env gives human output', async () => {
    const { stdout, exitCode } = await run(
      ['--dry-run', '--eval-file', EVAL_FILE],
      { CLAUDECODE: '' }
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Config valid');
  });

  it('agent + dry-run returns JSON plan with agentDetection', async () => {
    const { stdout } = await run(
      ['--dry-run', '--eval-file', EVAL_FILE],
      { CLAUDECODE: '1' }
    );
    const parsed = JSON.parse(stdout);
    expect(parsed.agentDetection).toBeDefined();
    expect(parsed.data.name).toBe('cli-test');
  });

  it('CODE_AGENT_EVAL_AGENT_DETECT=0 disables detection', async () => {
    const { stdout, exitCode } = await run(
      ['--dry-run', '--eval-file', EVAL_FILE],
      { CLAUDECODE: '1', CODE_AGENT_EVAL_AGENT_DETECT: '0' }
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Config valid');
    expect(() => JSON.parse(stdout)).toThrow();
  });

  it('agentDetection in JSON error envelope', async () => {
    const { stdout } = await run(['--json'], { CLAUDECODE: '1' });
    const parsed = JSON.parse(stdout);
    expect(parsed.agentDetection).toBeDefined();
    expect(parsed.agentDetection.type).toBe('agent');
  });
});

describe('resolveOutputMode', () => {
  const agentDetection = {
    isAgentic: true,
    id: 'claude-code',
    name: 'Claude Code',
    type: 'agent' as const,
  };

  const noDetection = {
    isAgentic: false,
    id: null,
    name: null,
    type: null,
  };

  const interactiveDetection = {
    isAgentic: true,
    id: 'cursor',
    name: 'Cursor',
    type: 'interactive' as const,
  };

  it('jsonFlag takes precedence over everything', () => {
    const result = resolveOutputMode({
      jsonFlag: true,
      agentDetectFlag: false,
      agentDetectEnv: '0',
      detection: noDetection,
    });
    expect(result.isJson).toBe(true);
    expect(result.isAgentMode).toBe(false);
  });

  it('agent detection enables JSON', () => {
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

  it('disabled flag prevents agent mode', () => {
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
      agentDetectEnv: '0',
      detection: agentDetection,
    });
    expect(result.isJson).toBe(false);
    expect(result.isAgentMode).toBe(false);
    expect(result.agentDetection.disabled).toBe(true);
  });

  it('interactive type does not trigger agent mode', () => {
    const result = resolveOutputMode({
      jsonFlag: false,
      agentDetectFlag: true,
      agentDetectEnv: undefined,
      detection: interactiveDetection,
    });
    expect(result.isJson).toBe(false);
    expect(result.isAgentMode).toBe(false);
  });

  it('no detection returns human mode', () => {
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

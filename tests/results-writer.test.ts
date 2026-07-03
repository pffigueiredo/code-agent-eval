import { describe, expect, test } from 'vitest';
import { writeResults, writeResultsAsJson, formatResultsAsMarkdown, formatResultsAsJUnit, formatResultsAsGitHubSummary } from '../src/results-writer';
import type { EvalResult } from '../src/types';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

const createMockResult = (overrides?: Partial<EvalResult>): EvalResult => ({
  evalName: 'test-eval',
  agentId: 'claude-code',
  timestamp: new Date('2025-01-15T14:30:22.000Z').toISOString(),
  success: true,
  duration: 5000,
  iterations: [
    {
      iterationId: 0,
      promptId: 'v1',
      success: true,
      duration: 2500,
      scores: {
        'build': { score: 1.0, reason: 'Build passed' },
        'test': { score: 1.0, reason: 'Tests passed' },
      },
      agentOutput: '{"message": "test output"}',
      environmentVariables: { NODE_ENV: 'test' },
    },
  ],
  aggregateScores: {
    'build': { mean: 1.0, min: 1.0, max: 1.0, stdDev: 0, passRate: 1.0 },
    'test': { mean: 1.0, min: 1.0, max: 1.0, stdDev: 0, passRate: 1.0 },
    '_overall': { mean: 1.0, min: 1.0, max: 1.0, stdDev: 0, passRate: 1.0 },
  },
  tokenUsage: {
    inputTokens: 1000,
    outputTokens: 500,
  },
  ...overrides,
});

describe('Results Writer', () => {
  test('writeResultsAsJson creates valid JSON file', async () => {
    const tempDir = path.join(os.tmpdir(), `test-json-${Date.now()}`);
    await fs.ensureDir(tempDir);
    const jsonPath = path.join(tempDir, 'results.json');

    const result = createMockResult();
    await writeResultsAsJson(result, jsonPath);

    expect(await fs.pathExists(jsonPath)).toBe(true);

    const content = await fs.readFile(jsonPath, 'utf-8');
    const parsed = JSON.parse(content);

    expect(parsed.evalName).toBe('test-eval');
    expect(parsed.agentId).toBe('claude-code');
    expect(parsed.success).toBe(true);
    expect(parsed.iterations).toHaveLength(1);

    await fs.remove(tempDir);
  });

  test('writeResults creates both JSON and markdown files', async () => {
    const tempDir = path.join(os.tmpdir(), `test-both-${Date.now()}`);
    await fs.ensureDir(tempDir);

    const result = createMockResult();
    const resultDir = await writeResults(result, tempDir);

    const jsonPath = path.join(resultDir, 'results.json');
    const mdPath = path.join(resultDir, 'results.md');
    const logPath = path.join(resultDir, 'iteration-v1-0.log');

    expect(await fs.pathExists(jsonPath)).toBe(true);
    expect(await fs.pathExists(mdPath)).toBe(true);
    expect(await fs.pathExists(logPath)).toBe(true);

    await fs.remove(tempDir);
  });

  test('JSON output includes agentId field', async () => {
    const tempDir = path.join(os.tmpdir(), `test-agentid-${Date.now()}`);
    await fs.ensureDir(tempDir);
    const jsonPath = path.join(tempDir, 'results.json');

    const result = createMockResult({ agentId: 'claude-sonnet-4' });
    await writeResultsAsJson(result, jsonPath);

    const parsed = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
    expect(parsed.agentId).toBe('claude-sonnet-4');

    await fs.remove(tempDir);
  });

  test('JSON round-trip preserves data integrity', async () => {
    const tempDir = path.join(os.tmpdir(), `test-roundtrip-${Date.now()}`);
    await fs.ensureDir(tempDir);
    const jsonPath = path.join(tempDir, 'results.json');

    const original = createMockResult({
      agentId: 'test-agent',
      tokenUsage: {
        inputTokens: 1500,
        outputTokens: 750,
        cacheCreationInputTokens: 200,
        cacheReadInputTokens: 100,
      },
    });

    await writeResultsAsJson(original, jsonPath);
    const parsed = JSON.parse(await fs.readFile(jsonPath, 'utf-8')) as EvalResult;

    expect(parsed.evalName).toBe(original.evalName);
    expect(parsed.agentId).toBe(original.agentId);
    expect(parsed.timestamp).toBe(original.timestamp);
    expect(parsed.duration).toBe(original.duration);
    expect(parsed.iterations).toHaveLength(original.iterations.length);
    expect(parsed.tokenUsage?.inputTokens).toBe(1500);
    expect(parsed.tokenUsage?.cacheCreationInputTokens).toBe(200);
    expect(parsed.aggregateScores.build.passRate).toBe(1.0);

    await fs.remove(tempDir);
  });

  test('writeResults creates directory with correct naming format', async () => {
    const tempDir = path.join(os.tmpdir(), `test-naming-${Date.now()}`);
    await fs.ensureDir(tempDir);

    const result = createMockResult({
      evalName: 'My Test Eval',
      timestamp: new Date('2025-01-15T14:30:22.000Z').toISOString(),
    });

    const resultDir = await writeResults(result, tempDir);
    const dirName = path.basename(resultDir);

    expect(dirName).toBe('my-test-eval-2025-01-15-143022');

    await fs.remove(tempDir);
  });

  test('formatResultsAsMarkdown includes agentId in output', () => {
    const result = createMockResult({ agentId: 'claude-sonnet-4' });
    const markdown = formatResultsAsMarkdown(result);

    // Markdown should contain the eval name
    expect(markdown).toContain('test-eval');
    // Should have summary section
    expect(markdown).toContain('## Summary');
    // Should have scorer results
    expect(markdown).toContain('build');
    expect(markdown).toContain('test');
  });

  test('writeResults handles multiple iterations', async () => {
    const tempDir = path.join(os.tmpdir(), `test-multi-${Date.now()}`);
    await fs.ensureDir(tempDir);

    const result = createMockResult({
      iterations: [
        {
          iterationId: 0,
          promptId: 'v1',
          success: true,
          duration: 1000,
          scores: {},
          agentOutput: 'output1',
          environmentVariables: {},
        },
        {
          iterationId: 1,
          promptId: 'v1',
          success: false,
          duration: 2000,
          scores: {},
          agentOutput: 'output2',
          environmentVariables: {},
          error: 'Test error',
        },
      ],
    });

    const resultDir = await writeResults(result, tempDir);

    const log0 = path.join(resultDir, 'iteration-v1-0.log');
    const log1 = path.join(resultDir, 'iteration-v1-1.log');

    expect(await fs.pathExists(log0)).toBe(true);
    expect(await fs.pathExists(log1)).toBe(true);

    const log1Content = await fs.readFile(log1, 'utf-8');
    expect(log1Content).toContain('Test error');

    await fs.remove(tempDir);
  });
});

describe('formatResultsAsJUnit', () => {
  test('produces well-formed XML with a testsuites root', () => {
    const xml = formatResultsAsJUnit(createMockResult());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<testsuites');
    expect(xml).toContain('</testsuites>');
    expect(xml).toContain('<testcase');
  });

  test('emits one testsuite per prompt', () => {
    const result = createMockResult({
      iterations: [
        {
          iterationId: 0,
          promptId: 'v1',
          success: true,
          duration: 1000,
          scores: { build: { score: 1.0, reason: 'ok' } },
          agentOutput: '',
          environmentVariables: {},
        },
        {
          iterationId: 0,
          promptId: 'v2',
          success: true,
          duration: 1000,
          scores: { build: { score: 1.0, reason: 'ok' } },
          agentOutput: '',
          environmentVariables: {},
        },
      ],
    });
    const xml = formatResultsAsJUnit(result);
    expect(xml).toContain('<testsuite name="v1"');
    expect(xml).toContain('<testsuite name="v2"');
    const suiteCount = (xml.match(/<testsuite /g) ?? []).length;
    expect(suiteCount).toBe(2);
  });

  test('failed iteration carries a <failure> with scorer reasons', () => {
    const result = createMockResult({
      success: false,
      iterations: [
        {
          iterationId: 0,
          promptId: 'v1',
          success: false,
          duration: 1000,
          scores: {
            build: { score: 0, reason: 'compile error' },
            test: { score: 1.0, reason: 'tests passed' },
          },
          agentOutput: '',
          environmentVariables: {},
        },
      ],
    });
    const xml = formatResultsAsJUnit(result);
    expect(xml).toContain('<failure');
    expect(xml).toContain('build');
    expect(xml).toContain('compile error');
    // passing scorer should not appear as a failing reason line
    expect(xml).not.toContain('tests passed');
  });

  test('excludes the synthetic _overall aggregate', () => {
    const xml = formatResultsAsJUnit(createMockResult());
    expect(xml).not.toContain('_overall');
  });

  test('escapes XML special characters', () => {
    const result = createMockResult({
      success: false,
      iterations: [
        {
          iterationId: 0,
          promptId: 'v1',
          success: false,
          duration: 1000,
          scores: {
            build: { score: 0, reason: 'expected <a> & "b" got \'c\'' },
          },
          agentOutput: '',
          environmentVariables: {},
        },
      ],
    });
    const xml = formatResultsAsJUnit(result);
    expect(xml).toContain('&lt;a&gt;');
    expect(xml).toContain('&amp;');
    expect(xml).toContain('&quot;');
    expect(xml).toContain('&apos;');
    // raw unescaped forms should not leak into the failure body
    expect(xml).not.toContain('<a>');
  });
});

describe('formatResultsAsGitHubSummary', () => {
  test('includes status, pass rate, and iteration counts', () => {
    const summary = formatResultsAsGitHubSummary(createMockResult());
    expect(summary).toContain('test-eval');
    expect(summary).toContain('PASSED');
    expect(summary).toContain('Pass Rate');
    expect(summary).toContain('100.0%');
    expect(summary).toContain('1/1 passed');
  });

  test('reports FAILED status for a failing run', () => {
    const summary = formatResultsAsGitHubSummary(
      createMockResult({
        success: false,
        aggregateScores: {
          build: { mean: 0, min: 0, max: 0, stdDev: 0, passRate: 0 },
          _overall: { mean: 0, min: 0, max: 0, stdDev: 0, passRate: 0 },
        },
      })
    );
    expect(summary).toContain('FAILED');
    expect(summary).toContain('0.0%');
  });

  test('includes per-prompt breakdown for multiple prompts', () => {
    const summary = formatResultsAsGitHubSummary(
      createMockResult({
        iterations: [
          {
            iterationId: 0,
            promptId: 'v1',
            success: true,
            duration: 1000,
            scores: { build: { score: 1.0, reason: 'ok' } },
            agentOutput: '',
            environmentVariables: {},
          },
          {
            iterationId: 0,
            promptId: 'v2',
            success: false,
            duration: 1000,
            scores: { build: { score: 0, reason: 'fail' } },
            agentOutput: '',
            environmentVariables: {},
          },
        ],
      })
    );
    expect(summary).toContain('### Prompts');
    expect(summary).toContain('v1');
    expect(summary).toContain('v2');
  });

  test('includes per-scorer breakdown and excludes _overall', () => {
    const summary = formatResultsAsGitHubSummary(createMockResult());
    expect(summary).toContain('### Scorers');
    expect(summary).toContain('build');
    expect(summary).toContain('test');
    // _overall should not appear in the scorer table
    expect(summary).not.toContain('_overall');
  });

  test('escapes pipes in promptId so the table is not corrupted', () => {
    const summary = formatResultsAsGitHubSummary(
      createMockResult({
        iterations: [
          {
            iterationId: 0,
            promptId: 'a|b',
            success: true,
            duration: 1000,
            scores: { build: { score: 1.0, reason: 'ok' } },
            agentOutput: '',
            environmentVariables: {},
          },
        ],
      })
    );
    expect(summary).toContain('a\\|b');
    // Every table row keeps exactly two interior separators (3 columns).
    const rows = summary
      .split('\n')
      .filter((l) => l.startsWith('|') && !l.includes('---'));
    for (const row of rows) {
      const cells = row.split('\\|').join('').split('|').length - 2;
      expect(cells).toBeGreaterThan(0);
    }
  });
});

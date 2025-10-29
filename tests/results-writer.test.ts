import { describe, expect, test } from 'vitest';
import { writeResults, writeResultsAsJson, formatResultsAsMarkdown } from '../src/results-writer';
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

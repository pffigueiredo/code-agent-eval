import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectScriptScorers } from '../src/eval-config-loader';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loader-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeConfig(config: unknown): string {
  const f = path.join(tmpDir, 'eval.json');
  fs.writeFileSync(f, JSON.stringify(config));
  return f;
}

describe('collectScriptScorers', () => {
  it('resolves a nested (all/any) script relative path to absolute', async () => {
    const f = writeConfig({
      name: 'x',
      prompts: [{ id: 'v1', prompt: 'p' }],
      projectDir: '.',
      scorers: [
        {
          type: 'all',
          of: [
            { type: 'build' },
            { type: 'any', of: [{ type: 'script', name: 'nested', path: './scorers/nested.mjs' }] },
          ],
        },
      ],
    });
    const scripts = await collectScriptScorers(f);
    expect(scripts).toHaveLength(1);
    expect(scripts[0].name).toBe('nested');
    expect(path.isAbsolute(scripts[0].path)).toBe(true);
    expect(scripts[0].path).toBe(path.join(tmpDir, 'scorers', 'nested.mjs'));
  });

  it('leaves an already-absolute script path untouched', async () => {
    const abs = path.join(tmpDir, 'abs.mjs');
    const f = writeConfig({
      name: 'x',
      prompts: [{ id: 'v1', prompt: 'p' }],
      projectDir: '.',
      scorers: [{ type: 'script', name: 's', path: abs }],
    });
    const scripts = await collectScriptScorers(f);
    expect(scripts[0].path).toBe(abs);
  });

  it('propagates a schema-invalid config as a thrown error', async () => {
    const f = writeConfig({
      name: 'x',
      prompts: [{ id: 'v1', prompt: 'p' }],
      projectDir: '.',
      scorers: [{ type: 'nope' }],
    });
    await expect(collectScriptScorers(f)).rejects.toThrow(/invalid eval config/i);
  });
});

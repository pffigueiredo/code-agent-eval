import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileScorer } from '../src/scorers/file';
import type { ScorerContext } from '../src/types';

function ctx(workingDir: string): ScorerContext {
  return {
    workingDir,
    diff: '',
    agentOutput: '[]',
    promptId: 't',
    execCommand: async () => ({ score: 1, reason: 'ok' }),
  };
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-scorer-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('FileScorer', () => {
  it('auto-derives name from path', () => {
    const s = new FileScorer({ type: 'file', path: 'src/foo.ts', exists: true });
    expect(s.name).toBe('file:src/foo.ts');
  });

  it('uses explicit name when provided', () => {
    const s = new FileScorer({ type: 'file', name: 'my-check', path: 'x', exists: true });
    expect(s.name).toBe('my-check');
  });

  it('passes when file exists and exists=true', async () => {
    fs.writeFileSync(path.join(tmpDir, 'hello.txt'), 'hi');
    const s = new FileScorer({ type: 'file', path: 'hello.txt', exists: true });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(1);
  });

  it('fails when file absent and exists=true', async () => {
    const s = new FileScorer({ type: 'file', path: 'missing.txt', exists: true });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(0);
    expect(r.reason).toContain('exists=true');
  });

  it('passes when file absent and exists=false', async () => {
    const s = new FileScorer({ type: 'file', path: 'nope.txt', exists: false });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(1);
  });

  it('fails when file present and exists=false', async () => {
    fs.writeFileSync(path.join(tmpDir, 'there.txt'), 'x');
    const s = new FileScorer({ type: 'file', path: 'there.txt', exists: false });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(0);
  });

  it('passes contains check', async () => {
    fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'hello world');
    const s = new FileScorer({ type: 'file', path: 'f.txt', contains: 'hello' });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(1);
  });

  it('fails contains check when string absent', async () => {
    fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'hello world');
    const s = new FileScorer({ type: 'file', path: 'f.txt', contains: 'nope' });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(0);
    expect(r.reason).toContain('contains');
  });

  it('passes matches check', async () => {
    fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'version: 1.2.3');
    const s = new FileScorer({ type: 'file', path: 'f.txt', matches: '\\d+\\.\\d+\\.\\d+' });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(1);
  });

  it('fails matches check', async () => {
    fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'no version here');
    const s = new FileScorer({ type: 'file', path: 'f.txt', matches: '\\d+\\.\\d+\\.\\d+' });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(0);
  });

  it('passes jsonPath check', async () => {
    fs.writeFileSync(path.join(tmpDir, 'data.json'), JSON.stringify({ status: 'ok' }));
    const s = new FileScorer({ type: 'file', path: 'data.json', jsonPath: { path: 'status', equals: 'ok' } });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(1);
  });

  it('fails jsonPath check on wrong value', async () => {
    fs.writeFileSync(path.join(tmpDir, 'data.json'), JSON.stringify({ status: 'err' }));
    const s = new FileScorer({ type: 'file', path: 'data.json', jsonPath: { path: 'status', equals: 'ok' } });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(0);
    expect(r.reason).toContain('jsonPath');
  });

  it('fails contains when file is missing', async () => {
    const s = new FileScorer({ type: 'file', path: 'gone.txt', contains: 'anything' });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(0);
    expect(r.reason).toContain('file not found');
  });

  it('scores 0 on invalid regex instead of throwing', async () => {
    fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'content');
    const s = new FileScorer({ type: 'file', path: 'f.txt', matches: '(' });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(0);
    expect(r.reason).toMatch(/invalid regex/i);
  });

  it('scores 0 on non-JSON file for jsonPath instead of throwing', async () => {
    fs.writeFileSync(path.join(tmpDir, 'f.json'), 'not json');
    const s = new FileScorer({ type: 'file', path: 'f.json', jsonPath: { path: 'a', equals: 1 } });
    const r = await s.evaluate(ctx(tmpDir));
    expect(r.score).toBe(0);
    expect(r.reason).toMatch(/invalid json|parse/i);
  });
});

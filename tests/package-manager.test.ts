import { describe, expect, test } from 'vitest';
import { detectPackageManager, getInstallCommand, type PackageManager } from '../src/package-manager';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

describe('Package Manager Detection', () => {
  test('should detect npm from package-lock.json', async () => {
    const tempDir = path.join(os.tmpdir(), `test-npm-${Date.now()}`);
    await fs.ensureDir(tempDir);
    await fs.writeFile(path.join(tempDir, 'package-lock.json'), '{}');

    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('npm');

    await fs.remove(tempDir);
  });

  test('should detect yarn from yarn.lock', async () => {
    const tempDir = path.join(os.tmpdir(), `test-yarn-${Date.now()}`);
    await fs.ensureDir(tempDir);
    await fs.writeFile(path.join(tempDir, 'yarn.lock'), '');

    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('yarn');

    await fs.remove(tempDir);
  });

  test('should detect pnpm from pnpm-lock.yaml', async () => {
    const tempDir = path.join(os.tmpdir(), `test-pnpm-${Date.now()}`);
    await fs.ensureDir(tempDir);
    await fs.writeFile(path.join(tempDir, 'pnpm-lock.yaml'), '');

    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('pnpm');

    await fs.remove(tempDir);
  });

  test('should detect bun from bun.lockb', async () => {
    const tempDir = path.join(os.tmpdir(), `test-bun-${Date.now()}`);
    await fs.ensureDir(tempDir);
    await fs.writeFile(path.join(tempDir, 'bun.lockb'), '');

    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('bun');

    await fs.remove(tempDir);
  });

  test('should detect bun from bun.lock', async () => {
    const tempDir = path.join(os.tmpdir(), `test-bun-text-${Date.now()}`);
    await fs.ensureDir(tempDir);
    await fs.writeFile(path.join(tempDir, 'bun.lock'), '');

    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('bun');

    await fs.remove(tempDir);
  });

  test('should default to npm when no lock file found', async () => {
    const tempDir = path.join(os.tmpdir(), `test-default-${Date.now()}`);
    await fs.ensureDir(tempDir);

    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('npm');

    await fs.remove(tempDir);
  });

  test('should prioritize bun over other lock files', async () => {
    const tempDir = path.join(os.tmpdir(), `test-priority-${Date.now()}`);
    await fs.ensureDir(tempDir);
    await fs.writeFile(path.join(tempDir, 'package-lock.json'), '{}');
    await fs.writeFile(path.join(tempDir, 'bun.lock'), '');

    const pm = await detectPackageManager(tempDir);
    expect(pm).toBe('bun');

    await fs.remove(tempDir);
  });
});

describe('Install Command Generation', () => {
  test('should return npm install command', () => {
    const cmd = getInstallCommand('npm');
    expect(cmd).toEqual(['npm', 'install']);
  });

  test('should return yarn install command', () => {
    const cmd = getInstallCommand('yarn');
    expect(cmd).toEqual(['yarn', 'install']);
  });

  test('should return pnpm install command', () => {
    const cmd = getInstallCommand('pnpm');
    expect(cmd).toEqual(['pnpm', 'install']);
  });

  test('should return bun install command', () => {
    const cmd = getInstallCommand('bun');
    expect(cmd).toEqual(['bun', 'install']);
  });
});

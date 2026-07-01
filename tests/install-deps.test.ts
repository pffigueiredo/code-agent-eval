import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('nypm', () => ({
  detectPackageManager: vi.fn(),
  installDependencies: vi.fn(),
}));

import { detectPackageManager, installDependencies } from 'nypm';
import { installProjectDependencies } from '../src/install-deps';

const detectMock = vi.mocked(detectPackageManager);
const installMock = vi.mocked(installDependencies);

describe('installProjectDependencies', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    installMock.mockResolvedValue(undefined as never);
  });

  it('installs with the detected package manager', async () => {
    detectMock.mockResolvedValue({ name: 'pnpm' } as never);

    const result = await installProjectDependencies('/tmp/project', true);

    expect(installMock).toHaveBeenCalledWith({
      cwd: '/tmp/project',
      silent: true,
      packageManager: 'pnpm',
    });
    expect(result.packageManager).toBe('pnpm');
  });

  it('falls back to npm when no package manager is detected', async () => {
    detectMock.mockResolvedValue(undefined as never);

    const result = await installProjectDependencies('/tmp/project', false);

    // Must pass packageManager explicitly — nypm throws on no auto-detect.
    expect(installMock).toHaveBeenCalledWith({
      cwd: '/tmp/project',
      silent: false,
      packageManager: 'npm',
    });
    expect(result.packageManager).toBe('npm');
  });

  it('defaults to silent installs', async () => {
    detectMock.mockResolvedValue({ name: 'yarn' } as never);

    await installProjectDependencies('/tmp/project');

    expect(installMock).toHaveBeenCalledWith({
      cwd: '/tmp/project',
      silent: true,
      packageManager: 'yarn',
    });
  });

  it('propagates install failures', async () => {
    detectMock.mockResolvedValue({ name: 'npm' } as never);
    installMock.mockRejectedValue(new Error('network down') as never);

    await expect(installProjectDependencies('/tmp/project')).rejects.toThrow(
      'network down'
    );
  });
});

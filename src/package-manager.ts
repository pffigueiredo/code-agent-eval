import fs from 'fs-extra';
import path from 'path';

/**
 * Supported package managers
 */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/**
 * Detects the package manager used by a project by checking for lock files.
 * Falls back to 'npm' if no lock file is found.
 *
 * Detection order:
 * 1. bun.lockb or bun.lock → bun
 * 2. pnpm-lock.yaml → pnpm
 * 3. yarn.lock → yarn
 * 4. package-lock.json → npm
 * 5. Default → npm
 */
export async function detectPackageManager(projectDir: string): Promise<PackageManager> {
  // Check for lock files in order of specificity
  const lockFiles: Array<[string, PackageManager]> = [
    ['bun.lockb', 'bun'],
    ['bun.lock', 'bun'],
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
  ];

  for (const [lockFile, packageManager] of lockFiles) {
    const lockPath = path.join(projectDir, lockFile);
    if (await fs.pathExists(lockPath)) {
      return packageManager;
    }
  }

  // Default to npm if no lock file found
  return 'npm';
}

/**
 * Returns the install command arguments for a given package manager.
 * The first element is the command, subsequent elements are arguments.
 *
 * Examples:
 * - npm: ['npm', 'install']
 * - yarn: ['yarn', 'install']
 * - pnpm: ['pnpm', 'install']
 * - bun: ['bun', 'install']
 */
export function getInstallCommand(packageManager: PackageManager): string[] {
  switch (packageManager) {
    case 'npm':
      return ['npm', 'install'];
    case 'yarn':
      return ['yarn', 'install'];
    case 'pnpm':
      return ['pnpm', 'install'];
    case 'bun':
      return ['bun', 'install'];
    default:
      // TypeScript exhaustiveness check
      const _exhaustive: never = packageManager;
      throw new Error(`Unknown package manager: ${_exhaustive}`);
  }
}

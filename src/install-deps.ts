import {
  detectPackageManager,
  installDependencies,
  type PackageManagerName,
} from 'nypm';

/**
 * Installs dependencies in `cwd` using the project's detected package manager.
 * Falls back to npm when none is detected — nypm otherwise throws.
 */
export async function installProjectDependencies(
  cwd: string,
  silent = true
): Promise<{ packageManager: PackageManagerName }> {
  const detected = await detectPackageManager(cwd);
  const packageManager = detected?.name ?? 'npm';
  await installDependencies({ cwd, silent, packageManager });
  return { packageManager };
}

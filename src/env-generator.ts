import type { EnvGeneratorContext } from './types';
import type { EvalConfig } from './runner';

/**
 * Generates environment variables for a single iteration
 */
export async function generateEnvironmentVariables(
  config: EvalConfig,
  context: EnvGeneratorContext
): Promise<Record<string, string>> {
  if (!config.environmentVariables) {
    return {};
  }

  // Static object
  if (typeof config.environmentVariables === 'object') {
    return { ...config.environmentVariables };
  }

  // Function generator
  const result = await config.environmentVariables(context);
  return result;
}

/**
 * Validates environment variable names and values
 */
export function validateEnvironmentVariables(
  vars: Record<string, string>
): void {
  for (const [key, value] of Object.entries(vars)) {
    // Check for invalid characters in keys
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      throw new Error(
        `Invalid environment variable name: "${key}". ` +
        `Names must start with letter or underscore and contain only letters, numbers, and underscores.`
      );
    }

    // Warn about overriding critical Node.js vars
    const criticalVars = ['PATH', 'NODE_PATH', 'NODE_ENV', 'HOME', 'TMPDIR'];
    if (criticalVars.includes(key.toUpperCase())) {
      console.warn(
        `Warning: Overriding system environment variable "${key}". ` +
        `This may cause unexpected behavior.`
      );
    }

    // Ensure values are strings
    if (typeof value !== 'string') {
      throw new Error(
        `Environment variable "${key}" must be a string, got ${typeof value}`
      );
    }
  }
}

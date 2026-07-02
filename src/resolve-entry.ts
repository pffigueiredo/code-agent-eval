import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

/**
 * Entry file for this package, from the CLI module's perspective.
 * Ensures eval files (and script scorers) can `import from 'code-agent-eval'`
 * under `npx` without a project-local install.
 */
export function resolveLibraryEntry(): string {
  try {
    return require.resolve('code-agent-eval');
  } catch {
    return path.join(__dirname, 'index.mjs');
  }
}

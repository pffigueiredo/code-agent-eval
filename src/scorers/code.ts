import { execa } from 'execa';
import type { Scorer } from '../types';

export function buildSuccess(): Scorer {
  return {
    name: 'build',
    fn: async ({ workingDir }) => {
      try {
        await execa('npm', ['run', 'build'], {
          cwd: workingDir,
          timeout: 300000 // 5 minutes
        });
        return { score: 1.0, reason: 'Build passed' };
      } catch (error) {
        return {
          score: 0.0,
          reason: `Build failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  };
}

export function testSuccess(): Scorer {
  return {
    name: 'test',
    fn: async ({ workingDir }) => {
      try {
        await execa('npm', ['run', 'test'], {
          cwd: workingDir,
          timeout: 300000
        });
        return { score: 1.0, reason: 'Tests passed' };
      } catch (error) {
        return {
          score: 0.0,
          reason: `Tests failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  };
}

export function lintSuccess(): Scorer {
  return {
    name: 'lint',
    fn: async ({ workingDir }) => {
      try {
        await execa('npm', ['run', 'lint'], {
          cwd: workingDir,
          timeout: 60000
        });
        return { score: 1.0, reason: 'Lint passed' };
      } catch (error) {
        return {
          score: 0.0,
          reason: `Lint failed: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }
  };
}

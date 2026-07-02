import { describe, it, expect } from 'vitest';
import { execa } from 'execa';
import fs from 'node:fs';
import path from 'node:path';

const CLI = path.resolve('dist/cli.mjs');
const jsonExamples = fs.readdirSync('examples').filter((f) => f.endsWith('.json'));

describe('examples/*.json all pass --dry-run', () => {
  for (const f of jsonExamples) {
    it(`${f} dry-runs cleanly`, async () => {
      const { exitCode } = await execa('node', [CLI, '--eval-file', path.join('examples', f), '--dry-run'], {
        reject: false,
      });
      expect(exitCode).toBe(0);
    });
  }
});

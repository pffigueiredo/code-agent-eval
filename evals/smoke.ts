import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { BuildSuccessScorer, BaseScorer } from '../src';
import type { ScorerContext, ScorerResult } from '../src';

// Deterministic custom scorer — passes if hello.txt was created on disk.
class HelloFileScorer extends BaseScorer {
  readonly name = 'hello-file-created';
  async evaluate(ctx: ScorerContext): Promise<ScorerResult> {
    try {
      const content = await readFile(
        path.join(ctx.workingDir, 'hello.txt'),
        'utf8'
      );
      const ok = content.toLowerCase().includes('hello');
      return {
        score: ok ? 1 : 0,
        reason: ok ? 'hello.txt created' : 'hello.txt content unexpected',
      };
    } catch {
      return { score: 0, reason: 'hello.txt missing' };
    }
  }
}

export default {
  name: 'smoke-test',
  prompts: [
    { id: 'create-file', prompt: 'Create a file named hello.txt containing the single word: hello' },
  ],
  projectDir: '/tmp/cae-scratch',
  iterations: 1,
  scorers: [new BuildSuccessScorer(), new HelloFileScorer()],
  tempDirCleanup: 'on-failure',
  // This machine's managed policy disables bypassPermissions; acceptEdits
  // auto-accepts Write/Edit and is not gated, so the agent can create files.
  claudeCodeOptions: { permissionMode: 'acceptEdits' },
};

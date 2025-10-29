import path from 'path';
import { EvalConfig, runClaudeCodeEval, scorers } from '../src';

async function main() {
  console.log('Comparing execution modes...\n');

  const baseConfig: EvalConfig = {
    name: 'add-neon-drizzle-to-project',
    prompts: [
      {
        id: 'default',
        prompt: 'I want to to build a todo application with neon and drizzle.',
      },
    ],
    projectDir:
      '/Users/pedro.figueiredo/Documents/git/personal/test-plugin-next',
    iterations: 5,
    scorers: [scorers.buildSuccess()],
    tempDirCleanup: 'never', // Keep temp directory for inspection ('always' | 'on-failure' | 'never')
    claudeCodeOptions: {
      plugins: [
        {
          type: 'local',
          path: '/Users/pedro.figueiredo/Documents/git/neon/ai-rules/neon-plugin',
        },
      ],
      systemPrompt: `Next.js 15+ App Router: params are Promises. Always use:
async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
Never use old synchronous params pattern: { params: { id: string } }`,
    },
    resultsDir: path.join(process.cwd(), 'eval-results'),
  };

  // Parallel
  console.log('=== PARALLEL ===');
  const start2 = Date.now();
  const result2 = await runClaudeCodeEval({
    ...baseConfig,
    execution: { mode: 'parallel' },
  });
  console.log(`Duration: ${(Date.now() - start2) / 1000}s\n`);

  // Print comparison
  console.log('=== PERFORMANCE COMPARISON ===');
  console.log(`Parallel:        ${(Date.now() - start2) / 1000}s`);
}

main().catch(console.error);

import { runClaudeCodeEval, scorers } from '../src';

async function main() {
  console.log('Running multi-prompt parallel evaluation...\n');

  // Test 3 different prompt variants for the same task
  const result = await runClaudeCodeEval({
    name: 'multi-prompt-auth-test',
    prompts: [
      {
        id: 'vendor-basic',
        prompt: 'Add Supabase authentication with email/password',
      },
      {
        id: 'vendor-detailed',
        prompt:
          'Add Supabase authentication with email/password. Use TypeScript types and follow Next.js 15 patterns.',
      },
      {
        id: 'custom',
        prompt:
          'Integrate Supabase authentication with email/password support. Use TypeScript strict mode, add error handling, and follow Next.js 15 App Router patterns.',
      },
    ],
    projectDir: './test-project',
    iterations: 3, // Each prompt runs 3 times
    execution: { mode: 'parallel' }, // All 9 runs (3 prompts × 3 iterations) execute concurrently
    scorers: [scorers.buildSuccess()],
    tempDirCleanup: 'always', // Delete temp dirs after each iteration ('always' | 'on-failure' | 'never')
  });

  // Print per-prompt analysis
  console.log('\n=== RESULTS BY PROMPT ===');
  const promptIds = [...new Set(result.iterations.map((i) => i.promptId))];
  for (const promptId of promptIds) {
    const promptResults = result.iterations.filter((i) => i.promptId === promptId);
    const passRate = promptResults.filter((r) => r.success).length / promptResults.length;
    const avgDuration =
      promptResults.reduce((sum, r) => sum + r.duration, 0) / promptResults.length;

    console.log(`\n${promptId}:`);
    console.log(`  Pass Rate: ${(passRate * 100).toFixed(1)}%`);
    console.log(`  Avg Duration: ${(avgDuration / 1000).toFixed(2)}s`);
    console.log(`  Runs: ${promptResults.length}`);
  }

  console.log('\n=== OVERALL SUMMARY ===');
  console.log(`Total runs: ${result.iterations.length}`);
  console.log(`Overall pass rate: ${(result.aggregateScores._overall.passRate * 100).toFixed(1)}%`);
}

main().catch(console.error);

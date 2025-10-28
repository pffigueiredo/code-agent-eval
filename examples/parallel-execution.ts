import { EvalConfig, runClaudeCodeEval, scorers } from '../src';

async function main() {
  console.log('Comparing execution modes...\n');

  const baseConfig: EvalConfig = {
    name: 'parallel-migrate-supabasejs-to-neonjs',
    prompts: [
      {
        id: 'default',
        prompt:
          'Based on https://registry.npmjs.org/@neondatabase/neon-js migrate from SupabaseJS to NeonJS.',
      },
    ],
    projectDir:
      '/Users/pedro.figueiredo/Documents/git/personal/todo-guardian-pro-supabasejs',
    iterations: 3,
    scorers: [scorers.buildSuccess()],
    keepTempDir: true, // Uncomment to preserve temp directory for inspection
    environmentVariables: {
      VITE_STACK_PROJECT_ID: 'fc07f8c9-ff33-4a43-828e-25842cbf385d',
      VITE_STACK_PUBLISHABLE_CLIENT_KEY:
        'pck_r5ecc257gg3mt8k97fktk1n4kxmy3g3yv71rtr1797b70',
      VITE_NEON_DATA_API_URL:
        'https://ep-gentle-flower-ad5hp63u.apirest.c-2.us-east-1.aws.neon.tech/neondb/rest/v1',
    },
  };

  // // Sequential
  // console.log('=== SEQUENTIAL ===');
  // const start1 = Date.now();
  // const result1 = await runClaudeCodeEval({
  //   ...baseConfig,
  //   name: 'sequential',
  //   // execution defaults to sequential
  // });
  // console.log(`Duration: ${(Date.now() - start1) / 1000}s\n`);

  // Parallel
  console.log('=== PARALLEL ===');
  const start2 = Date.now();
  const result2 = await runClaudeCodeEval({
    ...baseConfig,
    name: 'parallel-migrate-supabasejs-to-neonjs',
    execution: { mode: 'parallel' },
  });
  console.log(`Duration: ${(Date.now() - start2) / 1000}s\n`);

  // // Parallel with limit
  // console.log('=== PARALLEL (LIMIT=2) ===');
  // const start3 = Date.now();
  // const result3 = await runClaudeCodeEval({
  //   ...baseConfig,
  //   name: 'parallel-limit',
  //   execution: { mode: 'parallel-limit', concurrency: 2 },
  // });
  // console.log(`Duration: ${(Date.now() - start3) / 1000}s\n`);

  // Print comparison
  console.log('=== PERFORMANCE COMPARISON ===');
  console.log(`Parallel:        ${(Date.now() - start2) / 1000}s`);
}

main().catch(console.error);

import { runClaudeCodeEval, scorers } from '../src';

async function main() {
  console.log('Running Phase 1 eval example...\n');

  const result = await runClaudeCodeEval({
    name: 'migrate-supabasejs-to-neonjs',
    prompts: [
      {
        id: 'default',
        prompt:
          'Based on https://registry.npmjs.org/@neondatabase/neon-js migrate from SupabaseJS to NeonJS.',
      },
    ],
    projectDir:
      '/Users/pedro.figueiredo/Documents/git/personal/todo-guardian-pro-supabasejs', // Use this project as template
    iterations: 1,
    // execution defaults to sequential
    scorers: [scorers.buildSuccess()],
    keepTempDir: true, // Uncomment to preserve temp directory for inspection
    environmentVariables: {
      VITE_STACK_PROJECT_ID: 'fc07f8c9-ff33-4a43-828e-25842cbf385d',
      VITE_STACK_PUBLISHABLE_CLIENT_KEY:
        'pck_r5ecc257gg3mt8k97fktk1n4kxmy3g3yv71rtr1797b70',
      VITE_NEON_DATA_API_URL:
        'https://ep-gentle-flower-ad5hp63u.apirest.c-2.us-east-1.aws.neon.tech/neondb/rest/v1',
    },
  });

  // The summary is already printed by runClaudeCodeEval
  // Here you can access the result object for programmatic use:

  console.log('\n=== PROGRAMMATIC ACCESS ===');
  console.log(`Result object contains:`);
  console.log(`  - evalName: "${result.evalName}"`);
  console.log(`  - timestamp: ${result.timestamp}`);
  console.log(`  - success: ${result.success}`);
  console.log(`  - duration: ${result.duration}ms`);
  console.log(
    `  - scores: ${Object.keys(result.iterations[0].scores).length} scorer(s)`
  );

  if (result.tokenUsage) {
    console.log(`  - tokenUsage:`);
    console.log(`      inputTokens: ${result.tokenUsage.inputTokens}`);
    console.log(`      outputTokens: ${result.tokenUsage.outputTokens}`);
    if (result.tokenUsage.cacheCreationInputTokens) {
      console.log(
        `      cacheCreationInputTokens: ${result.tokenUsage.cacheCreationInputTokens}`
      );
    }
    if (result.tokenUsage.cacheReadInputTokens) {
      console.log(
        `      cacheReadInputTokens: ${result.tokenUsage.cacheReadInputTokens}`
      );
    }
  }

  if (result.workingDir) {
    console.log(`  - workingDir: ${result.workingDir}`);
  }

  if (result.error) {
    console.error('\n=== ERROR ===');
    console.error(result.error);
  }
}

main().catch(console.error);

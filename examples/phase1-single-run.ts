import { runClaudeCodeEval, scorers } from '../src';

async function main() {
  console.log('Running Phase 1 eval example...\n');

  const result = await runClaudeCodeEval({
    name: 'migrate-supabasejs-to-neonjs',
    prompt:
      'Based on https://registry.npmjs.org/@neondatabase/neon-js migrate from SupabaseJS to NeonJS.',
    projectDir:
      '/Users/pedro.figueiredo/Documents/git/personal/todo-guardian-pro-supabasejs', // Use this project as template
    scorers: [scorers.buildSuccess()],
    keepTempDir: true, // Uncomment to preserve temp directory for inspection
  });

  // The summary is already printed by runClaudeCodeEval
  // Here you can access the result object for programmatic use:

  console.log('\n=== PROGRAMMATIC ACCESS ===');
  console.log(`Result object contains:`);
  console.log(`  - evalName: "${result.evalName}"`);
  console.log(`  - timestamp: ${result.timestamp}`);
  console.log(`  - success: ${result.success}`);
  console.log(`  - duration: ${result.duration}ms`);
  console.log(`  - scores: ${Object.keys(result.scores).length} scorer(s)`);

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
      console.log(`      cacheReadInputTokens: ${result.tokenUsage.cacheReadInputTokens}`);
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

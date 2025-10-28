import { runClaudeCodeEval, scorers } from '../src';
import path from 'path';

async function main() {
  console.log('Running eval with markdown results export...\n');

  // Run an evaluation with results exported to markdown
  const result = await runClaudeCodeEval({
    name: 'add-health-endpoint',
    prompts: [
      {
        id: 'default',
        prompt: 'Add a health check endpoint that returns the server status',
      },
    ],
    projectDir: './test-project',
    iterations: 5,
    execution: {
      mode: 'sequential'
    },
    scorers: [
      scorers.buildSuccess(),
      scorers.testSuccess(),
    ],
    // NEW: Export results to markdown file
    resultsDir: path.join(process.cwd(), 'eval-results'),
  });

  console.log('\n=== EVALUATION COMPLETE ===');
  console.log(`Pass Rate: ${(result.aggregateScores._overall.passRate * 100).toFixed(1)}%`);
  console.log(`Results exported to: eval-results/add-health-endpoint-{timestamp}.md`);
}

main().catch(console.error);

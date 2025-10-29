import { runClaudeCodeEval, scorers } from '../src';

async function main() {
  console.log('Running Phase 2 multi-iteration eval with environment variables...\n');

  // Example 1: Static environment variables (sequential, default)
  const result1 = await runClaudeCodeEval({
    name: 'static-env-vars',
    prompts: [
      {
        id: 'default',
        prompt: 'Add a health check endpoint that returns the current NODE_ENV',
      },
    ],
    projectDir: './test-project',
    iterations: 3,
    environmentVariables: {
      NODE_ENV: 'test',
      API_URL: 'https://test-api.example.com',
      LOG_LEVEL: 'debug'
    },
    scorers: [scorers.buildSuccess()],
  });

  console.log('Result 1 - Pass Rate:', (result1.aggregateScores._overall.passRate * 100).toFixed(1) + '%');

  // Example 2: Dynamic environment variables
  const result2 = await runClaudeCodeEval({
    name: 'dynamic-env-vars',
    prompts: [
      {
        id: 'default',
        prompt: 'Create a database migration for users table',
      },
    ],
    projectDir: './test-project',
    iterations: 5,
    environmentVariables: (context) => ({
      ITERATION_ID: `iter-${context.iteration}`,
      DB_NAME: `test_db_${context.iteration}`,
      DB_PORT: String(5432 + context.iteration),
      SEED: String(context.iteration * 42), // Reproducible randomness
      TIMESTAMP: new Date().toISOString()
    }),
    scorers: [scorers.buildSuccess(), scorers.testSuccess()],
  });

  console.log('Result 2 - Pass Rate:', (result2.aggregateScores._overall.passRate * 100).toFixed(1) + '%');

  // Example 3: Async environment variable generation
  const result3 = await runClaudeCodeEval({
    name: 'async-env-generation',
    prompts: [
      {
        id: 'default',
        prompt: 'Add authentication using the provided API key',
      },
    ],
    projectDir: './test-project',
    iterations: 3,
    environmentVariables: async (context) => {
      // Simulate fetching a test API key from a service
      const apiKey = await generateTestApiKey(`test-user-${context.iteration}`);

      return {
        API_KEY: apiKey,
        USER_ID: `test-user-${context.iteration}`,
        ITERATION: String(context.iteration)
      };
    },
    scorers: [scorers.buildSuccess()],
    tempDirCleanup: 'never', // Keep temp dirs to inspect generated .env files ('always' | 'on-failure' | 'never')
  });

  console.log('Result 3 - Pass Rate:', (result3.aggregateScores._overall.passRate * 100).toFixed(1) + '%');

  console.log('\n=== ALL EVALUATIONS COMPLETE ===\n');
}

// Mock function for example
async function generateTestApiKey(userId: string): Promise<string> {
  // In real usage, this might call an external service
  return `sk_test_${userId}_${Date.now()}`;
}

main().catch(console.error);

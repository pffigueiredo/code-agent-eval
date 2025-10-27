import path from 'path';
import { EvalConfig, runClaudeCodeEval, scorers } from '../src';

async function main() {
  console.log('Comparing execution modes...\n');

  const baseConfig: EvalConfig = {
    name: 'check-add-neon-docs-skill-used',
    prompt: 'Add docs about neon and drizzle.',
    projectDir:
      '/Users/pedro.figueiredo/Documents/git/personal/todo-guardian-pro-supabasejs',
    iterations: 30,
    scorers: [
      scorers.buildSuccess(),
      scorers.createScorer(
        'add-neon-docs-skill-used',
        async ({ agentOutput }) => {
          const messages = JSON.parse(agentOutput);

          // Check if any assistant message contains the Skill tool_use
          const skillUsed = messages.some((msg: any) => {
            // Check for assistant messages with content
            if (msg.type !== 'assistant' || !msg.message?.content) {
              return false;
            }

            // Check if any content item is a Skill tool use with our command
            return msg.message.content.some(
              (content: any) =>
                content.type === 'tool_use' &&
                content.name === 'Skill' &&
                content.input?.command?.includes('neon-plugin:add-neon-docs')
            );
          });

          if (skillUsed) {
            return {
              score: 1.0,
              reason: 'add-neon-docs skill used',
            };
          } else {
            return {
              score: 0.0,
              reason: 'add-neon-docs skill not used',
            };
          }
        }
      ),
      scorers.createScorer(
        'claude-md-added-to-project',
        async ({ workingDir }) => {
          // Check if CLAUDE.md exists with correct content (handles both CLAUDE.md and claude.md)
          const fs = await import('fs/promises');
          const path = await import('path');

          try {
            // Try both common names
            let content: string;
            try {
              content = await fs.readFile(
                path.join(workingDir, 'CLAUDE.md'),
                'utf-8'
              );
            } catch {
              content = await fs.readFile(
                path.join(workingDir, 'claude.md'),
                'utf-8'
              );
            }

            const hasNeonDrizzleDocs = content.includes(
              'https://raw.githubusercontent.com/neondatabase-labs/ai-rules/main/neon-drizzle.mdc'
            );

            if (hasNeonDrizzleDocs) {
              return {
                score: 1.0,
                reason:
                  'CLAUDE.md exists with correct neon-drizzle documentation reference',
              };
            } else {
              return {
                score: 0.5,
                reason:
                  'CLAUDE.md exists but missing neon-drizzle documentation reference',
                metadata: {
                  hint: 'Expected URL: https://raw.githubusercontent.com/.../neon-drizzle.mdc',
                },
              };
            }
          } catch (error) {
            return {
              score: 0.0,
              reason: 'CLAUDE.md file not found in project',
            };
          }
        }
      ),
    ],
    keepTempDir: true, // Uncomment to preserve temp directory for inspection
    claudeCodeOptions: {
      plugins: [
        {
          type: 'local',
          path: '/Users/pedro.figueiredo/Documents/git/neon/ai-rules/neon-plugin',
        },
      ],
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

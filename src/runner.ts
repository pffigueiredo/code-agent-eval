import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { execa } from 'execa';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import type { EvalResult, Scorer, ScorerResult, TokenUsage, EnvGeneratorContext, IterationResult, AggregateScore } from './types';
import { generateEnvironmentVariables, validateEnvironmentVariables } from './env-generator';

export interface EvalConfig {
  name: string;
  prompt: string;
  projectDir: string; // Path to user's codebase (original, untouched)
  timeout?: number; // Default: 600000ms (10 minutes)
  scorers?: Scorer[];
  claudeCodeOptions?: Options;
  verbose?: boolean; // Default: false. Show detailed SDK message logs when true
  keepTempDir?: boolean; // Default: false. Keep temp directory after eval for inspection
  environmentVariables?:
    | Record<string, string>
    | ((context: import('./types').EnvGeneratorContext) => Record<string, string> | Promise<Record<string, string>>);
}

/**
 * Format a tool invocation with key parameters
 */
function formatToolInvocation(toolName: string, input: any): string {
  // Extract the most important parameter for common tools
  let param = '';

  switch (toolName) {
    case 'WebFetch':
      param = input?.url || '';
      return `⏺ Fetch(${param})`;

    case 'Read':
      param = input?.file_path || '';
      // Show just filename if it's a long path
      const filename = param.split('/').pop() || param;
      return `⏺ Read(${filename})`;

    case 'Write':
      param = input?.file_path || '';
      return `⏺ Write(${param.split('/').pop() || param})`;

    case 'Edit':
      param = input?.file_path || '';
      return `⏺ Edit(${param.split('/').pop() || param})`;

    case 'Bash':
      param = input?.command || '';
      // Truncate long commands
      if (param.length > 50) {
        param = param.substring(0, 47) + '...';
      }
      return `⏺ Bash(${param})`;

    case 'Grep':
      param = input?.pattern || '';
      return `⏺ Grep(pattern="${param}")`;

    case 'Glob':
      param = input?.pattern || '';
      return `⏺ Glob(${param})`;

    case 'WebSearch':
      param = input?.query || '';
      return `⏺ WebSearch(${param})`;

    case 'Task':
      param = input?.description || '';
      return `⏺ Task(${param})`;

    case 'Skill':
      param = input?.command || '';
      return `⏺ Skill(${param})`;

    default:
      // For unknown tools, try to show first meaningful parameter
      if (input && typeof input === 'object') {
        const firstKey = Object.keys(input)[0];
        if (firstKey) {
          param = String(input[firstKey]).substring(0, 50);
        }
      }
      return param ? `⏺ ${toolName}(${param})` : `⏺ ${toolName}()`;
  }
}

/**
 * Format a tool result summary
 */
function formatToolResult(toolName: string, result: any): string {
  // Handle error results
  if (result?.isError || result?.error) {
    const errorMsg = result?.error || result?.content?.[0]?.text || 'Error';
    return `  ⎿ Error: ${errorMsg.substring(0, 100)}`;
  }

  // Extract result content
  const content = result?.content;
  if (Array.isArray(content) && content.length > 0) {
    const firstBlock = content[0];

    // Text content
    if (firstBlock.type === 'text') {
      const text = firstBlock.text || '';
      const lines = text.split('\n').length;
      const chars = text.length;

      // Format based on tool type
      switch (toolName) {
        case 'WebFetch':
          // Try to extract size from headers or content length
          const kb = (chars / 1024).toFixed(1);
          return `  ⎿ Received ${kb}KB`;

        case 'Read':
          return `  ⎿ Read ${lines} lines`;

        case 'Grep':
          // Count matches if possible
          const matches = text.split('\n').filter((l: string) => l.trim()).length;
          return `  ⎿ Found ${matches} matches`;

        case 'Glob':
          const files = text.split('\n').filter((l: string) => l.trim()).length;
          return `  ⎿ Found ${files} files`;

        case 'Bash':
          if (text.trim()) {
            return `  ⎿ Output: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`;
          }
          return `  ⎿ Completed`;

        default:
          if (chars > 0) {
            return `  ⎿ Returned ${chars} chars`;
          }
          return `  ⎿ Success`;
      }
    }
  }

  return `  ⎿ Completed`;
}

/**
 * Format SDK messages in a user-friendly way (similar to Claude Code CLI)
 * Returns formatted output lines and updates the tool use tracking map
 */
function formatMessage(
  message: any,
  pendingToolUses: Map<string, { name: string; input: any }>
): string | null {
  // Handle assistant messages with tool uses and text
  if (message.type === 'assistant' && message.message?.content) {
    const content = message.message.content;

    if (Array.isArray(content)) {
      const outputs: string[] = [];
      for (const block of content) {
        if (block.type === 'tool_use') {
          // Track this tool use for when the result comes back
          pendingToolUses.set(block.id, {
            name: block.name,
            input: block.input,
          });
          // Immediately show the tool invocation
          outputs.push(formatToolInvocation(block.name, block.input));
        } else if (block.type === 'text' && block.text.trim()) {
          outputs.push(block.text.trim());
        }
      }
      return outputs.length > 0 ? outputs.join('\n') : null;
    }
  }

  // Handle user messages with tool results (synthetic messages from SDK)
  if (message.type === 'user' && message.isSynthetic && message.message?.content) {
    const content = message.message.content;

    if (Array.isArray(content)) {
      const outputs: string[] = [];
      for (const block of content) {
        if (block.type === 'tool_result') {
          // Look up the original tool use
          const toolUse = pendingToolUses.get(block.tool_use_id);
          if (toolUse) {
            outputs.push(formatToolResult(toolUse.name, block));
            // Clean up the tracking
            pendingToolUses.delete(block.tool_use_id);
          }
        }
      }
      return outputs.length > 0 ? outputs.join('\n') : null;
    }
  }

  // Handle result messages (completion)
  if (message.type === 'result') {
    const duration = message.duration_ms
      ? `${(message.duration_ms / 1000).toFixed(1)}s`
      : 'unknown';
    if (message.subtype === 'success') {
      return `✓ Completed in ${duration}`;
    } else if (message.subtype === 'error_during_execution') {
      return `✗ Error during execution`;
    } else if (message.subtype === 'error_max_turns') {
      return `✗ Error: Max turns reached`;
    }
  }

  // Skip other message types
  return null;
}

/**
 * Runs a single evaluation iteration
 */
async function runSingleIteration(
  config: EvalConfig,
  context: EnvGeneratorContext
): Promise<IterationResult> {
  const startTime = Date.now();
  const evalId = randomUUID();
  const tempDir = path.join(os.tmpdir(), `eval-${evalId}`);

  // Generate environment variables for this iteration
  const envVars = await generateEnvironmentVariables(config, context);
  validateEnvironmentVariables(envVars);

  if (config.verbose) {
    console.log(`\n[Iteration ${context.iteration}] Environment variables:`, envVars);
  }

  try {
    // 1. Copy project to temp directory
    console.log(`[Iteration ${context.iteration}] Copying ${config.projectDir} to ${tempDir}...`);
    await fs.copy(config.projectDir, tempDir, {
      filter: (src) => !src.includes('node_modules'),
    });

    // 2. Initialize git if needed
    const isGitRepo = await fs.pathExists(path.join(tempDir, '.git'));
    if (!isGitRepo) {
      await execa('git', ['init'], { cwd: tempDir });
      await execa('git', ['add', '.'], { cwd: tempDir });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: tempDir });
    }

    // 3. Create .env file with environment variables (for Claude Code Agent to use)
    if (Object.keys(envVars).length > 0) {
      const envFileContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      await fs.writeFile(path.join(tempDir, '.env'), envFileContent, 'utf-8');
    }

    // 4. Run Claude Code Agent SDK with user's prompt
    // Note: query() doesn't have env option, so we set process.env temporarily
    const originalEnv = { ...process.env };
    Object.assign(process.env, envVars);

    try {
      console.log(`[Iteration ${context.iteration}] Running prompt: "${config.prompt}" in ${tempDir}...`);
      const result = query({
        prompt: config.prompt,
        options: {
          cwd: tempDir,
          settingSources: ['project'],
          permissionMode: 'bypassPermissions',
          ...config.claudeCodeOptions,
        },
      });

      // Collect all output from the async generator
      const allMessages: any[] = [];
      const pendingToolUses = new Map<string, { name: string; input: any }>();
      let tokenUsage: TokenUsage | undefined;

      for await (const message of result) {
        allMessages.push(message);

        // Extract token usage from result message
        if (message.type === 'result' && message.usage) {
          tokenUsage = {
            inputTokens: message.usage.input_tokens || 0,
            outputTokens: message.usage.output_tokens || 0,
            cacheCreationInputTokens: message.usage.cache_creation_input_tokens,
            cacheReadInputTokens: message.usage.cache_read_input_tokens,
          };
        }

        // Log messages based on verbose setting
        if (config.verbose) {
          console.log('\n[Claude Code]', message.type, ':', JSON.stringify(message, null, 2));
        } else {
          const formatted = formatMessage(message, pendingToolUses);
          if (formatted) {
            console.log(formatted);
          }
        }
      }
      const agentOutput = JSON.stringify(allMessages);

      // 5. Capture git diff
      console.log(`[Iteration ${context.iteration}] Capturing changes...`);
      const { stdout: diff } = await execa('git', ['diff', 'HEAD'], {
        cwd: tempDir,
      });

      // 6. Run scorers with environment variables in context
      console.log(`[Iteration ${context.iteration}] Running scorers...`);
      const scores: Record<string, ScorerResult> = {};
      for (const scorer of config.scorers || []) {
        const result = await scorer.fn({
          workingDir: tempDir,
          diff,
          agentOutput,
          environmentVariables: envVars,
        });
        scores[scorer.name] = result;
        console.log(`  ${scorer.name}: ${result.score.toFixed(2)} - ${result.reason}`);
      }

      const duration = Date.now() - startTime;
      const success = Object.values(scores).every((s) => s.score === 1.0);

      return {
        iterationId: context.iteration,
        success,
        duration,
        scores,
        diff,
        tokenUsage,
        workingDir: config.keepTempDir ? tempDir : undefined,
        environmentVariables: envVars,
      };
    } finally {
      // Restore original environment
      process.env = originalEnv;
    }
  } catch (error) {
    return {
      iterationId: context.iteration,
      success: false,
      duration: Date.now() - startTime,
      scores: {},
      diff: '',
      error: error instanceof Error ? error.message : String(error),
      environmentVariables: envVars,
    };
  } finally {
    // 7. Cleanup (unless keepTempDir option is set)
    if (!config.keepTempDir) {
      console.log(`[Iteration ${context.iteration}] Cleaning up temp directory...`);
      await fs.remove(tempDir);
    } else {
      console.log(`[Iteration ${context.iteration}] Temp directory preserved at ${tempDir}`);
    }
  }
}

/**
 * Calculate aggregate statistics across iterations
 */
function calculateAggregateScores(
  results: IterationResult[]
): Record<string, AggregateScore> {
  const aggregates: Record<string, AggregateScore> = {};

  // Get all scorer names
  const scorerNames = new Set<string>();
  for (const result of results) {
    for (const name of Object.keys(result.scores)) {
      scorerNames.add(name);
    }
  }

  // Calculate aggregates for each scorer
  for (const scorerName of scorerNames) {
    const scores = results
      .map(r => r.scores[scorerName]?.score)
      .filter((s): s is number => s !== undefined);

    if (scores.length === 0) continue;

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const variance = scores.reduce((acc, score) => acc + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    const passRate = scores.filter(s => s >= 1.0).length / scores.length;

    aggregates[scorerName] = { mean, min, max, stdDev, passRate };
  }

  // Overall pass rate (all scorers passed)
  const overallPassRate = results.filter(r => r.success).length / results.length;
  aggregates._overall = {
    mean: overallPassRate,
    min: overallPassRate,
    max: overallPassRate,
    stdDev: 0,
    passRate: overallPassRate,
  };

  return aggregates;
}

/**
 * Main entry point: Runs evaluation with multiple iterations
 */
export async function runClaudeCodeEval(
  config: EvalConfig,
  iterations: number = 1
): Promise<EvalResult> {
  const startTime = Date.now();
  const results: IterationResult[] = [];

  console.log(`\nStarting evaluation "${config.name}" with ${iterations} iteration(s)...\n`);

  // Run iterations sequentially
  for (let i = 0; i < iterations; i++) {
    const context: EnvGeneratorContext = {
      iteration: i,
      evalName: config.name,
      totalIterations: iterations,
    };

    const result = await runSingleIteration(config, context);
    results.push(result);

    // Print iteration summary
    console.log(`\n[Iteration ${i}] ${result.success ? '✓ PASSED' : '✗ FAILED'} in ${(result.duration / 1000).toFixed(2)}s`);
  }

  // Calculate aggregate scores
  const aggregateScores = calculateAggregateScores(results);

  // Print comprehensive summary
  const duration = Date.now() - startTime;
  const overallSuccess = results.every(r => r.success);

  console.log('\n' + '='.repeat(60));
  console.log('EVALUATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Eval Name: ${config.name}`);
  console.log(`Total Duration: ${(duration / 1000).toFixed(2)}s`);
  console.log(`Iterations: ${results.length}`);
  console.log(`Pass Rate: ${(aggregateScores._overall.passRate * 100).toFixed(1)}%`);
  console.log(`Status: ${overallSuccess ? '✓ ALL PASSED' : '✗ SOME FAILED'}`);

  // Display aggregate scores
  if (Object.keys(aggregateScores).length > 1) {
    console.log('\nAggregate Scores:');
    for (const [name, agg] of Object.entries(aggregateScores)) {
      if (name === '_overall') continue;
      console.log(`  ${name}:`);
      console.log(`    Mean: ${agg.mean.toFixed(2)} | Min: ${agg.min.toFixed(2)} | Max: ${agg.max.toFixed(2)} | StdDev: ${agg.stdDev.toFixed(2)}`);
      console.log(`    Pass Rate: ${(agg.passRate * 100).toFixed(1)}%`);
    }
  }

  // Display total token usage
  const totalTokenUsage = results.reduce((acc, r) => {
    if (r.tokenUsage) {
      acc.inputTokens += r.tokenUsage.inputTokens;
      acc.outputTokens += r.tokenUsage.outputTokens;
      acc.cacheCreationInputTokens += r.tokenUsage.cacheCreationInputTokens || 0;
      acc.cacheReadInputTokens += r.tokenUsage.cacheReadInputTokens || 0;
    }
    return acc;
  }, { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 });

  if (totalTokenUsage.inputTokens > 0) {
    const totalInput = totalTokenUsage.inputTokens +
      totalTokenUsage.cacheCreationInputTokens +
      totalTokenUsage.cacheReadInputTokens;
    console.log('\nTotal Token Usage:');
    console.log(`  Input tokens: ${totalInput.toLocaleString()}`);
    console.log(`  Output tokens: ${totalTokenUsage.outputTokens.toLocaleString()}`);
    console.log(`  Total: ${(totalInput + totalTokenUsage.outputTokens).toLocaleString()} tokens`);
  }

  console.log('='.repeat(60) + '\n');

  return {
    evalName: config.name,
    timestamp: new Date().toISOString(),
    success: overallSuccess,
    duration,
    iterations: results,
    aggregateScores,
    tokenUsage: totalTokenUsage.inputTokens > 0 ? totalTokenUsage : undefined,
  };
}

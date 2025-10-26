import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import { execa } from 'execa';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import type { EvalResult, Scorer, ScorerResult, TokenUsage } from './types';

export interface EvalConfig {
  name: string;
  prompt: string;
  projectDir: string; // Path to user's codebase (original, untouched)
  timeout?: number; // Default: 600000ms (10 minutes)
  scorers?: Scorer[];
  claudeCodeOptions?: Options;
  verbose?: boolean; // Default: false. Show detailed SDK message logs when true
  keepTempDir?: boolean; // Default: false. Keep temp directory after eval for inspection
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

export async function runClaudeCodeEval(
  config: EvalConfig
): Promise<EvalResult> {
  const startTime = Date.now();
  const evalId = randomUUID();
  const tempDir = path.join(os.tmpdir(), `eval-${evalId}`);

  try {
    // 1. Copy project to temp directory (preserving git history)
    console.log(`Copying ${config.projectDir} to ${tempDir}...`);
    await fs.copy(config.projectDir, tempDir, {
      filter: (src) => {
        // Skip node_modules but keep everything else including .git
        return !src.includes('node_modules');
      },
    });

    // 2. Initialize git in temp dir if not already a repo
    const isGitRepo = await fs.pathExists(path.join(tempDir, '.git'));
    if (!isGitRepo) {
      await execa('git', ['init'], { cwd: tempDir });
      await execa('git', ['add', '.'], { cwd: tempDir });
      await execa('git', ['commit', '-m', 'Initial commit'], { cwd: tempDir });
    }

    // 3. Run Claude Code Agent SDK with user's prompt
    console.log(`Running prompt: "${config.prompt}" in ${tempDir}...`);
    const result = query({
      prompt: config.prompt,
      options: {
        cwd: tempDir,
        settingSources: ['project'],
        permissionMode: 'bypassPermissions', // Auto-approve all operations for unattended eval runs
        ...config.claudeCodeOptions, // User can override if needed
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
        // Verbose mode: show full JSON dump
        console.log('\n[Claude Code]', message.type, ':', JSON.stringify(message, null, 2));
      } else {
        // Clean mode: show user-friendly output with tool details
        const formatted = formatMessage(message, pendingToolUses);
        if (formatted) {
          console.log(formatted);
        }
      }
    }
    const agentOutput = JSON.stringify(allMessages);

    // 5. Capture git diff
    console.log('Capturing changes...');
    const { stdout: diff } = await execa('git', ['diff', 'HEAD'], {
      cwd: tempDir,
    });

    // 6. Run scorers
    console.log('Running scorers...');
    const scores: Record<string, ScorerResult> = {};
    for (const scorer of config.scorers || []) {
      const result = await scorer.fn({
        workingDir: tempDir,
        diff,
        agentOutput: JSON.stringify(agentOutput),
      });
      scores[scorer.name] = result;
    }

    const duration = Date.now() - startTime;
    const success = Object.values(scores).every((s) => s.score === 1.0);

    // Print comprehensive summary
    console.log('\n' + '='.repeat(60));
    console.log('EVALUATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Eval Name: ${config.name}`);
    console.log(`Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`Status: ${success ? '✓ PASSED' : '✗ FAILED'}`);

    // Display scores
    if (Object.keys(scores).length > 0) {
      console.log('\nScores:');
      for (const [name, result] of Object.entries(scores)) {
        const status = result.score === 1.0 ? '✓' : '✗';
        console.log(`  ${status} ${name}: ${result.score.toFixed(2)} - ${result.reason}`);
      }
    }

    // Display token usage
    if (tokenUsage) {
      const totalInputTokens = tokenUsage.inputTokens +
        (tokenUsage.cacheCreationInputTokens || 0) +
        (tokenUsage.cacheReadInputTokens || 0);
      console.log('\nToken Usage:');
      console.log(`  Input tokens: ${totalInputTokens.toLocaleString()}`);
      console.log(`  Output tokens: ${tokenUsage.outputTokens.toLocaleString()}`);
      console.log(`  Total: ${(totalInputTokens + tokenUsage.outputTokens).toLocaleString()} tokens`);
    }

    console.log('='.repeat(60) + '\n');

    return {
      evalName: config.name,
      timestamp: new Date().toISOString(),
      success,
      duration,
      scores,
      diff,
      tokenUsage,
      workingDir: config.keepTempDir ? tempDir : undefined,
    };
  } catch (error) {
    return {
      evalName: config.name,
      timestamp: new Date().toISOString(),
      success: false,
      duration: Date.now() - startTime,
      scores: {},
      diff: '',
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    // 7. Cleanup (unless keepTempDir option is set)
    if (!config.keepTempDir) {
      console.log('Cleaning up temp directory...');
      await fs.remove(tempDir);
    } else {
      console.log(`Temp directory preserved at ${tempDir}`);
    }
  }
}

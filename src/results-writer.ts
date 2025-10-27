import fs from 'fs-extra';
import path from 'path';
import type { EvalResult } from './types';

/**
 * Format a timestamp as YYYY-MM-DD-HHMMSS for filenames
 */
function formatTimestampForFilename(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

/**
 * Sanitize eval name for use in filename
 */
function sanitizeForFilename(name: string): string {
  return name.replace(/[^a-z0-9-_]/gi, '-').toLowerCase();
}

/**
 * Format evaluation results as markdown
 */
export function formatResultsAsMarkdown(result: EvalResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Evaluation Results: ${result.evalName}`);
  lines.push('');

  // Summary metadata
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Date**: ${new Date(result.timestamp).toLocaleString()}`);
  lines.push(`- **Duration**: ${(result.duration / 1000).toFixed(2)}s`);
  lines.push(`- **Iterations**: ${result.iterations.length}`);
  lines.push(`- **Overall Status**: ${result.success ? '✓ PASSED' : '✗ FAILED'}`);
  if (result.aggregateScores._overall) {
    lines.push(`- **Pass Rate**: ${(result.aggregateScores._overall.passRate * 100).toFixed(1)}%`);
  }
  if (result.error) {
    lines.push(`- **Error**: ${result.error}`);
  }
  lines.push('');

  // Aggregate scores table (exclude _overall)
  const scorerNames = Object.keys(result.aggregateScores).filter(name => name !== '_overall');
  if (scorerNames.length > 0) {
    lines.push('## Aggregate Scores');
    lines.push('');
    lines.push('| Scorer | Mean | Min | Max | Std Dev | Pass Rate |');
    lines.push('|--------|------|-----|-----|---------|-----------|');

    for (const name of scorerNames) {
      const agg = result.aggregateScores[name];
      lines.push(
        `| ${name} | ${agg.mean.toFixed(3)} | ${agg.min.toFixed(3)} | ${agg.max.toFixed(3)} | ${agg.stdDev.toFixed(3)} | ${(agg.passRate * 100).toFixed(1)}% |`
      );
    }
    lines.push('');
  }

  // Per-iteration results table
  if (result.iterations.length > 0) {
    lines.push('## Iteration Results');
    lines.push('');

    // Collect all scorer names from all iterations
    const allScorerNames = new Set<string>();
    for (const iter of result.iterations) {
      for (const scorerName of Object.keys(iter.scores)) {
        allScorerNames.add(scorerName);
      }
    }
    const sortedScorerNames = Array.from(allScorerNames).sort();

    // Build table header
    const header = ['| Iteration | Status | Duration (s) | ' + sortedScorerNames.join(' | ') + ' |'];
    const separator = ['|-----------|--------|--------------|' + sortedScorerNames.map(() => '------').join('|') + '|'];
    lines.push(header.join(''));
    lines.push(separator.join(''));

    // Build table rows
    for (const iter of result.iterations) {
      const status = iter.success ? '✓ Pass' : '✗ Fail';
      const duration = (iter.duration / 1000).toFixed(2);
      const scores = sortedScorerNames.map(name => {
        const score = iter.scores[name];
        if (score) {
          return score.score.toFixed(3);
        }
        return 'N/A';
      });

      lines.push(`| ${iter.iterationId} | ${status} | ${duration} | ${scores.join(' | ')} |`);
    }
    lines.push('');

    // Add detailed iteration results (reasons for scores)
    lines.push('### Detailed Results');
    lines.push('');
    for (const iter of result.iterations) {
      lines.push(`#### Iteration ${iter.iterationId}`);
      lines.push('');
      if (iter.error) {
        lines.push(`**Error**: ${iter.error}`);
        lines.push('');
      }
      if (Object.keys(iter.scores).length > 0) {
        lines.push('**Scorer Details**:');
        lines.push('');
        for (const [name, score] of Object.entries(iter.scores)) {
          lines.push(`- **${name}**: ${score.score.toFixed(3)}`);
          lines.push(`  - Reason: ${score.reason}`);
          if (score.metadata && Object.keys(score.metadata).length > 0) {
            lines.push(`  - Metadata: ${JSON.stringify(score.metadata)}`);
          }
        }
        lines.push('');
      }
      if (iter.workingDir) {
        lines.push(`**Working Directory**: \`${iter.workingDir}\``);
        lines.push('');
      }
    }
  }

  // Token usage table
  if (result.tokenUsage) {
    lines.push('## Token Usage');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Input Tokens | ${result.tokenUsage.inputTokens.toLocaleString()} |`);
    lines.push(`| Output Tokens | ${result.tokenUsage.outputTokens.toLocaleString()} |`);
    if (result.tokenUsage.cacheCreationInputTokens) {
      lines.push(`| Cache Creation Input Tokens | ${result.tokenUsage.cacheCreationInputTokens.toLocaleString()} |`);
    }
    if (result.tokenUsage.cacheReadInputTokens) {
      lines.push(`| Cache Read Input Tokens | ${result.tokenUsage.cacheReadInputTokens.toLocaleString()} |`);
    }
    const totalInput = result.tokenUsage.inputTokens +
      (result.tokenUsage.cacheCreationInputTokens || 0) +
      (result.tokenUsage.cacheReadInputTokens || 0);
    const total = totalInput + result.tokenUsage.outputTokens;
    lines.push(`| **Total** | **${total.toLocaleString()}** |`);
    lines.push('');
  }

  // Per-iteration token usage if available
  const hasIterTokenUsage = result.iterations.some(iter => iter.tokenUsage);
  if (hasIterTokenUsage) {
    lines.push('### Token Usage Per Iteration');
    lines.push('');
    lines.push('| Iteration | Input | Output | Cache Creation | Cache Read | Total |');
    lines.push('|-----------|-------|--------|----------------|------------|-------|');

    for (const iter of result.iterations) {
      if (iter.tokenUsage) {
        const input = iter.tokenUsage.inputTokens;
        const output = iter.tokenUsage.outputTokens;
        const cacheCreation = iter.tokenUsage.cacheCreationInputTokens || 0;
        const cacheRead = iter.tokenUsage.cacheReadInputTokens || 0;
        const total = input + output + cacheCreation + cacheRead;

        lines.push(
          `| ${iter.iterationId} | ${input.toLocaleString()} | ${output.toLocaleString()} | ${cacheCreation.toLocaleString()} | ${cacheRead.toLocaleString()} | ${total.toLocaleString()} |`
        );
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Write evaluation results to a markdown file in the specified directory
 * @param result - The evaluation result to write
 * @param outputDir - Directory where the markdown file should be written
 * @returns The path to the written file
 */
export async function writeResults(
  result: EvalResult,
  outputDir: string
): Promise<string> {
  // Ensure output directory exists
  await fs.ensureDir(outputDir);

  // Generate filename: {evalName}-{timestamp}.md
  const sanitizedName = sanitizeForFilename(result.evalName);
  const formattedTimestamp = formatTimestampForFilename(result.timestamp);
  const filename = `${sanitizedName}-${formattedTimestamp}.md`;
  const filePath = path.join(outputDir, filename);

  // Format and write markdown
  const markdown = formatResultsAsMarkdown(result);
  await fs.writeFile(filePath, markdown, 'utf-8');

  return filePath;
}

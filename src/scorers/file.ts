import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ScorerContext, ScorerResult } from '../types';
import { BaseScorer } from './base';
import type { FileScorerSpec } from './schema';

/**
 * Scorer that checks a file in the working dir against ANDed sub-checks
 * (exists / contains / matches / jsonPath). Name auto-derives to `file:<path>`.
 */
export class FileScorer extends BaseScorer {
  readonly name: string;

  constructor(private readonly spec: FileScorerSpec) {
    super();
    this.name = spec.name ?? `file:${spec.path}`;
  }

  async evaluate({ workingDir }: ScorerContext): Promise<ScorerResult> {
    const { spec } = this;
    const abs = path.join(workingDir, spec.path);
    let content: string | null = null;
    try {
      content = await readFile(abs, 'utf8');
    } catch {
      content = null;
    }
    const fails: string[] = [];
    if (spec.exists != null && (content !== null) !== spec.exists) fails.push(`exists=${spec.exists}`);
    if (content !== null) {
      if (spec.contains != null && !content.includes(spec.contains)) fails.push(`contains "${spec.contains}"`);
      if (spec.matches != null) {
        let re: RegExp | null = null;
        try {
          re = new RegExp(spec.matches);
        } catch {
          fails.push(`invalid regex /${spec.matches}/`);
        }
        if (re != null && !re.test(content)) fails.push(`matches /${spec.matches}/`);
      }
      if (spec.jsonPath != null) {
        try {
          const val = getDotted(JSON.parse(content), spec.jsonPath.path);
          if (val !== spec.jsonPath.equals) fails.push(`jsonPath ${spec.jsonPath.path}`);
        } catch {
          fails.push(`invalid json for jsonPath ${spec.jsonPath.path}`);
        }
      }
    } else if (spec.contains != null || spec.matches != null || spec.jsonPath != null) {
      fails.push('file not found');
    }
    return fails.length === 0
      ? { score: 1, reason: `${spec.path}: all checks passed` }
      : { score: 0, reason: `${spec.path}: failed ${fails.join(', ')}` };
  }
}

function getDotted(obj: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<any>((acc, k) => (acc == null ? acc : acc[k]), obj);
}

// Emit JUnit + JSON from a committed fixture so self-CI exercises the artifact
// formatters without an API key.
// Usage: tsx tests/fixtures/emit-artifacts.ts [outputDir]  (default: ./ci-artifacts)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatResultsAsJUnit,
  formatResultsAsJson,
} from '../../src/results-writer';
import type { EvalResult } from '../../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const outputDir = process.argv[2] ?? './ci-artifacts';
mkdirSync(outputDir, { recursive: true });

const fixturePath = path.join(__dirname, 'fixture-result.json');
const result: EvalResult = JSON.parse(readFileSync(fixturePath, 'utf-8'));

const junitPath = path.join(outputDir, 'results.junit.xml');
writeFileSync(junitPath, formatResultsAsJUnit(result), 'utf-8');

const jsonPath = path.join(outputDir, 'results.json');
writeFileSync(jsonPath, formatResultsAsJson(result), 'utf-8');

console.log(`Wrote ${junitPath}`);
console.log(`Wrote ${jsonPath}`);

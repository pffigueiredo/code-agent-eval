// Drive the Phase 3 artifact formatters over a committed fixture, writing real
// JUnit XML + JSON into an output dir. Used by self-CI to exercise the artifact
// code end-to-end without an API key.
//
// Usage: tsx tests/fixtures/emit-artifacts.ts [outputDir]  (default: ./ci-artifacts)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatResultsAsJUnit } from '../../src/results-writer';
import type { EvalResult } from '../../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const outputDir = process.argv[2] ?? './ci-artifacts';
mkdirSync(outputDir, { recursive: true });

const fixturePath = path.join(__dirname, 'fixture-result.json');
const result: EvalResult = JSON.parse(readFileSync(fixturePath, 'utf-8'));

const junitPath = path.join(outputDir, 'results.junit.xml');
writeFileSync(junitPath, formatResultsAsJUnit(result), 'utf-8');

const jsonPath = path.join(outputDir, 'results.json');
writeFileSync(jsonPath, JSON.stringify(result, null, 2), 'utf-8');

console.log(`Wrote ${junitPath}`);
console.log(`Wrote ${jsonPath}`);

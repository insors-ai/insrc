import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { childEnvironment, runtimeContext } from '../test-harness/context.mjs';
import { fingerprint, ROOT } from '../test-harness/build.mjs';
import { MUTATION_FILE, parseArgs, runHarness } from '../test-harness/run.mjs';

// Prepared-reader reuse and writer/drift guards live in test-harness-coordinator.test.ts.
test('Retirement mutation refuses raw invocation without changing prepared output', { timeout: 20000 }, () => {
	const before = fingerprint(ROOT, ['out', 'packages/project-memory/dist']);
	const child = spawnSync(process.execPath, ['--import', 'tsx', '--test', MUTATION_FILE], { cwd: ROOT, env: { ...childEnvironment(runtimeContext()), INSRC_TEST_RUN_ID: '', INSRC_TEST_ROOT: '' }, encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
	assert.equal(child.status, 1);
	assert.match(child.stdout + child.stderr, /harness-context-invalid|Use npm test/);
	assert.equal(fingerprint(ROOT, ['out', 'packages/project-memory/dist']), before, 'unsupported raw mutation cannot rebuild or plant stale output');
});

test('Retirement-package stale-output rebuild remains a serial mutation regression', { timeout: 240000 }, async () => {
	const result = await runHarness(ROOT, parseArgs(ROOT, [MUTATION_FILE]));
	assert.equal(result.code, 0, JSON.stringify(result.results));
	const log = readFileSync(join(ROOT, result.results[0].log), 'utf8');
	assert.match(log, /ok 1 - clean build and package remove retired runtime and planted stale output/);
	assert.equal(result.results[0].coverage.counts.pass, 1);
	assert.equal(JSON.parse(readFileSync(join(result.workspace, 'cleanup.json'), 'utf8')).confirmedClosed, true);
});

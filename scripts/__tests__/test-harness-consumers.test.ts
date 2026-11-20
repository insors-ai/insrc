import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { childEnvironment, createRun, runtimeContext } from '../test-harness/context.mjs';
import { fingerprint, prepareBuild, ROOT } from '../test-harness/build.mjs';
import { withRun } from '../test-harness/process.mjs';
import { MUTATION_FILE, parseArgs, runHarness } from '../test-harness/run.mjs';

const consumers = ['src/cli/services/__tests__/daemon-ctl-forced-stop.test.ts', 'src/shared/__tests__/process-broker-native.test.ts', 'src/daemon/__tests__/shutdown-lifecycle-evidence.test.ts', 'src/daemon/__tests__/shutdown-watchdog.test.ts', 'src/daemon/__tests__/shutdown-bounded.test.ts'];

test('Five prepared consumers reuse helpers and raw invocations refuse missing context', { timeout: 180000 }, async () => {
	const before = fingerprint(ROOT, ['out']);
	for (const file of [...consumers, MUTATION_FILE]) {
		const child = spawnSync(process.execPath, ['--import', 'tsx', '--test', file], { cwd: ROOT, env: { ...childEnvironment(runtimeContext()), INSRC_TEST_RUN_ID: '', INSRC_TEST_ROOT: '' }, encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024 });
		assert.equal(child.status, 1, file);
		assert.match(child.stdout + child.stderr, /harness-context-invalid|Use npm test/, file);
	}
	assert.equal(fingerprint(ROOT, ['out']), before, 'unsupported raw consumers cannot rebuild or plant stale output');
	const run = createRun(ROOT);
	await withRun(run, async scope => {
		await prepareBuild(run, scope);
		run.transition('reading');
		const outputBefore = fingerprint(ROOT, ['out']);
		const script = `import {requirePreparedBuild} from ${JSON.stringify(pathToFileURL(join(ROOT, 'scripts/test-harness/build.mjs')).href)};for(let i=0;i<5;i++)requirePreparedBuild(process.cwd());`;
		const result = await scope.start(run.runtime.executable, ['--input-type=module', '-e', script]);
		assert.equal(result.code, 0);
		assert.equal(fingerprint(ROOT, ['out']), outputBefore);
	});
});

test('Retirement-package stale-output rebuild remains a serial mutation regression', { timeout: 240000 }, async () => {
	const result = await runHarness(ROOT, parseArgs(ROOT, [MUTATION_FILE]));
	assert.equal(result.code, 0, JSON.stringify(result.results));
	const log = readFileSync(join(ROOT, result.results[0].log), 'utf8');
	assert.match(log, /ok 1 - clean build and package remove retired runtime and planted stale output/);
	assert.equal(result.results[0].coverage.counts.pass, 1);
	assert.equal(JSON.parse(readFileSync(join(result.workspace, 'cleanup.json'), 'utf8')).confirmedClosed, true);
});

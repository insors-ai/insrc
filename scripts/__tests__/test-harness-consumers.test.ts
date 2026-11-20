import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
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
		const titles = ['Shell start and restart refuse spawn after lifecycle failures even in conditional contexts', 'normal build ships the host broker with no numeric-PID kill symbol', 'Compiled helper packaging and affected lifecycle regression suites', 'Ready handshake reports spawn failure, early exit and timeout', 'Watchdog arm failure self-kills before blocked native cleanup'];
		const evidence = [];
		for (const [i, file] of consumers.entries()) {
			const log = join(run.workspace, `actual-consumer-${i}.tap`), fd = openSync(log, 'wx');
			try {
				const result = await scope.start(run.runtime.executable, ['--import', 'tsx', '--test', '--test-reporter=tap', `--test-name-pattern=^${titles[i]}$`, file], { stdout: fd, stderr: fd, logPath: log });
				const tap = readFileSync(log, 'utf8');
				assert.equal(result.code, 0, `${file}: ${tap}`);
				assert.match(tap, /^# pass 1$/m, file);
				assert.doesNotMatch(tap, /harness-context-invalid|harness-build-drift|hookFailed/);
				evidence.push({ file, selectedTitle: titles[i], code: result.code, log, coverage: 'one existing behavioral/packaging case plus the actual before hook; remaining native lifecycle cases are not claimed by this control' });
			} finally { closeSync(fd); }
		}
		const contender = await scope.start(run.runtime.executable, ['scripts/test-harness/build.mjs']);
		assert.equal(contender.code, 1);
		assert.match(readFileSync(contender.log, 'utf8'), /harness-write-during-read/);
		writeFileSync(join(run.workspace, 'consumer-reuse-evidence.json'), JSON.stringify({ evidence, deferredNativeCoverage: 'Unselected native lifecycle cases remain pending isolated diagnosis in Batch 17; no original assertion was removed or weakened.' }, null, 2));
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

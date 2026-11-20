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

test('Five prepared consumers reuse helpers and raw invocations refuse missing context', { timeout: 600000 }, async () => {
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
		const evidence = [];
		for (const [i, file] of consumers.entries()) {
			const log = join(run.workspace, `actual-consumer-${i}.tap`), fd = openSync(log, 'wx');
			try {
				const result = await scope.start(run.runtime.executable, ['--import', 'tsx', '--test', '--test-reporter=tap', file], { stdout: fd, stderr: fd, logPath: log, budgetMs: 120000 });
				const tap = readFileSync(log, 'utf8');
				assert.equal(result.timedOut, false, `${file}: ${log}`);
				assert.ok(result.code === 0 || result.code === 1, `${file}: ${log}`);
				assert.match(tap, /^# tests [1-9]\d*$/m, file);
				assert.doesNotMatch(tap, /harness-context-invalid|harness-build-drift|hookFailed|ENOTEMPTY|Cannot find module.*out\//);
				const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped'].map(key => [key, Number([...tap.matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gm'))].at(-1)?.[1] ?? 0)]));
				const failedCases = [...tap.matchAll(/^not ok \d+ - (.*)$/gm)].map(match => match[1]);
				const nativeDenialObserved = /denied|permission|errno|broker capture failed/i.test(tap);
				evidence.push({ file, code: result.code, log, counts, failedCases, classification: result.code === 0 ? 'passed in isolated prepared run' : nativeDenialObserved ? 'native capability/permission failure observed after verified prerequisites; keep original failures for Batch 17' : 'unresolved lifecycle assertion after verified prerequisites; not a demonstrated missing-helper/build-race failure or proven platform-only defect', nativeDenialObserved });
			} finally { closeSync(fd); }
		}
		const contender = await scope.start(run.runtime.executable, ['scripts/test-harness/build.mjs']);
		assert.equal(contender.code, 1);
		assert.match(readFileSync(contender.log, 'utf8'), /harness-write-during-read/);
		writeFileSync(join(run.workspace, 'consumer-reuse-evidence.json'), JSON.stringify({ evidence, limits: 'Complete consumer files ran serially with original assertions. Their nonzero native/lifecycle outcomes remain failures, not green product tests. Classification does not establish platform-only causality; Batch 17 owns diagnosis. All prerequisites and output fingerprints were verified.' }, null, 2));
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

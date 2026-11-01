import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FORBIDDEN = /_setTrackerExecForTests|_legacy-table|_setRegistryTableFactoryForTests/;

const TRACKER = [
	'workflow/tracker/__tests__/github-adapter.test.ts',
	'workflow/tracker/__tests__/github-comments.test.ts',
	'workflow/tracker/__tests__/github-signoff-revise.test.ts',
	'workflow/tracker/__tests__/github-signoff.test.ts',
	'workflow/tracker/__tests__/issue-title-guard.test.ts',
	'workflow/tracker/__tests__/port-post-comment.test.ts',
	'workflow/tracker/__tests__/port.test.ts',
	'workflow/tracker/__tests__/setup-plan.test.ts',
	'workflow/tracker/__tests__/setup.test.ts',
	'workflow/tracker/__tests__/tasks.test.ts',
	'workflow/tracker/__tests__/title-token.test.ts',
	'workflow/tracker/__tests__/tracker.test.ts',
];
const WORKFLOW = [
	'workflow/__tests__/approve-attach.test.ts',
	'workflow/__tests__/approve-fallback-issues.test.ts',
	'workflow/__tests__/approve-fallback-kit.ts',
	'workflow/__tests__/bugfix-tracker.test.ts',
	'workflow/__tests__/draft-issues.test.ts',
	'workflow/__tests__/meta-only-body-unchanged.test.ts',
	'workflow/__tests__/questions.test.ts',
	'workflow/__tests__/redraft-preserves-tracker.test.ts',
	'workflow/__tests__/tracker-auto.test.ts',
	'workflow/__tests__/tracker-tasks.test.ts',
	'workflow/tasks/__tests__/task-set-approve.test.ts',
];
const DAEMON_CLI = [
	'cli/__tests__/tracker-setup-service.test.ts',
	'daemon/__tests__/repo-settings.test.ts',
	'daemon/__tests__/sync-plan-tasks-denial.test.ts',
	'daemon/__tests__/tasks-sync-async.test.ts',
	'daemon/__tests__/workflow-approve-followon.test.ts',
	'daemon/__tests__/workflow-approve-pipeline.test.ts',
];

/** Runs the files themselves, so "pass" is the files' own result and not a reading of their text. */
function runFiles(files: readonly string[]): Promise<{ code: number | null; output: string }> {
	return new Promise(resolve => {
		const child = spawn(process.execPath, ['--import', 'tsx', '--test', '--test-force-exit', ...files.map(f => join(SRC, f)).filter(f => f.endsWith('.test.ts'))], { cwd: join(SRC, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
		let output = '';
		child.stdout.on('data', d => { output += String(d); });
		child.stderr.on('data', d => { output += String(d); });
		child.on('close', code => resolve({ code, output }));
	});
}

function offenders(files: readonly string[]): string[] {
	return files.filter(f => FORBIDDEN.test(readFileSync(join(SRC, f), 'utf8')));
}

test('the migrated tracker test files pass on the stand-in binaries and none imports the exec seam or the legacy table', { timeout: 900_000 }, async () => {
	assert.deepEqual(offenders(TRACKER), []);
	const ran = await runFiles(TRACKER);
	assert.equal(ran.code, 0, ran.output.slice(-3000));
});

test('the migrated workflow test files pass on the stand-in binaries and none imports the exec seam or the legacy table', { timeout: 900_000 }, async () => {
	assert.deepEqual(offenders(WORKFLOW), []);
	const ran = await runFiles(WORKFLOW);
	assert.equal(ran.code, 0, ran.output.slice(-3000));
});

test('the migrated daemon and cli test files pass on the stand-in binaries and none of the 32 files imports the exec seam or the legacy table', { timeout: 900_000 }, async () => {
	assert.deepEqual(offenders(DAEMON_CLI), []);
	const ran = await runFiles(DAEMON_CLI);
	assert.equal(ran.code, 0, ran.output.slice(-3000));
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon-side validate checks (ISSUE-f1bf0fb3, LLD-f1bf0fb3-s1, task t2):
 * test-file resolution and per-route plans over a temporary git repository,
 * and the check runner over real child processes.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import {
	TEST_RUNNER_ARGV,
	TYPECHECK_ARGV,
	planTaskCheckPlan,
	resolveTaskTestFiles,
	runValidationChecks,
	smallStandaloneCheckPlan,
	trivialCheckPlan,
	type ValidationCheckPlan,
} from '../validation-checks.js';

function gitRepo(files: Readonly<Record<string, string>>): string {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-validate-checks-'));
	for (const [rel, body] of Object.entries(files)) {
		mkdirSync(dirname(join(repo, rel)), { recursive: true });
		writeFileSync(join(repo, rel), body);
	}
	const git = (...args: string[]): void => { execFileSync('git', args, { cwd: repo, stdio: 'ignore' }); };
	git('init', '-q');
	git('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '.');
	git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'fixture');
	return repo;
}

const TREE = {
	'src/a/__tests__/notice.test.ts':      '',
	'src/a/__tests__/driver-unit.test.ts': '',
	'src/b/__tests__/driver-unit.test.ts': '',
	'src/b/__tests__/chain.test.ts':       '',
	'src/b/notice.test.ts':                '', // not under __tests__
};

function isAlive(pid: number): boolean {
	try { process.kill(pid, 0); return true; } catch { return false; }
}

/** A plan whose commands are plain node, so the runner is exercised without npx. */
function nodePlan(over: Partial<ValidationCheckPlan>): ValidationCheckPlan {
	return {
		typecheck: ['node', '-e', 'process.exit(0)'],
		testCommand: ['node', '--test', '--test-force-exit'],
		testFiles: [], unresolvedTests: [],
		typecheckTimeoutMs: 10_000, testTimeoutMs: 20_000,
		...over,
	};
}

// --- resolution and plans (unit) ---------------------------------------------

test("resolveTaskTestFiles maps plan test names to tracked __tests__ files, de-duplicates, and lists names with no match as unresolved", () => {
	const repo = gitRepo(TREE);
	try {
		const r = resolveTaskTestFiles(repo, [
			"notice.test.ts: 'makeNotice sorts and de-duplicates ids'",
			"notice.test.ts: 'sortNotices gives one order'",
			"missing.test.ts: 'not in the repo'",
			'a name with no file at all',
		]);
		assert.deepEqual(r.files, ['src/a/__tests__/notice.test.ts']);
		assert.deepEqual(r.unresolved, ["missing.test.ts: 'not in the repo'", 'a name with no file at all']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a base name under two __tests__ directories resolves to both files', () => {
	const repo = gitRepo(TREE);
	try {
		const r = resolveTaskTestFiles(repo, ["driver-unit.test.ts: 'x'"]);
		assert.deepEqual(r.files, ['src/a/__tests__/driver-unit.test.ts', 'src/b/__tests__/driver-unit.test.ts']);
		assert.deepEqual(r.unresolved, []);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('the plan-driven, small and trivial routes each build the expected check plan', () => {
	const repo = gitRepo(TREE);
	try {
		const planDriven = planTaskCheckPlan(repo, { tests: [{ name: "notice.test.ts: 'a'" }, { name: "chain.test.ts: 'b'" }] });
		assert.deepEqual(planDriven.typecheck, TYPECHECK_ARGV);
		assert.deepEqual(planDriven.testCommand, TEST_RUNNER_ARGV);
		assert.ok(planDriven.testCommand.includes('--test-force-exit'));
		assert.deepEqual(planDriven.testFiles, ['src/a/__tests__/notice.test.ts', 'src/b/__tests__/chain.test.ts']);
		assert.equal(planDriven.noTests, undefined);
		assert.deepEqual(planTaskCheckPlan(repo, { tests: [] }).noTests, { ok: false, note: 'the plan task names no tests' });

		const small = smallStandaloneCheckPlan(repo, { testLevels: [
			{ subjects: ["chain.test.ts: 'x'", 'prose with no file'] },
			{ subjects: ["driver-unit.test.ts: 'y'"] },
		] });
		assert.deepEqual(small.testFiles, ['src/a/__tests__/driver-unit.test.ts', 'src/b/__tests__/chain.test.ts', 'src/b/__tests__/driver-unit.test.ts']);
		assert.deepEqual(smallStandaloneCheckPlan(repo, { testLevels: [{ subjects: ['prose only'] }] }).noTests, { ok: false, note: 'the LLD names no test file' });

		// Trivial: the fixture commit added every file, so HEAD touched the four __tests__ files.
		assert.deepEqual(trivialCheckPlan(repo).testFiles, [
			'src/a/__tests__/driver-unit.test.ts', 'src/a/__tests__/notice.test.ts',
			'src/b/__tests__/chain.test.ts', 'src/b/__tests__/driver-unit.test.ts',
		]);
		// A later commit that touches no test file.
		writeFileSync(join(repo, 'README.md'), 'x');
		execFileSync('git', ['add', 'README.md'], { cwd: repo });
		execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'readme'], { cwd: repo, stdio: 'ignore' });
		const trivial = trivialCheckPlan(repo);
		assert.deepEqual(trivial.testFiles, []);
		assert.deepEqual(trivial.noTests, { ok: true, note: 'no tests named for a trivial build' });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('a test name whose only *.test.ts token is not a leading prefix is unresolved, and the file it mentions is not run', () => {
	const repo = gitRepo(TREE);
	try {
		const name = 'WorkflowChainReaderTest.computeHldEffectiveHash fold (mirrors chain.test.ts hldEffectiveHash)';
		const plan = planTaskCheckPlan(repo, { tests: [{ name }] });
		assert.deepEqual(plan.testFiles, []);
		assert.deepEqual(plan.unresolvedTests, [name]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// --- the runner (integration) --------------------------------------------------

test('a passing and a failing command give ok true and ok false with their exit codes and output tails', async () => {
	const pass = await runValidationChecks(process.cwd(), nodePlan({ typecheck: ['node', '-e', "console.log('typecheck clean')"] }));
	assert.equal(pass.typecheck.ok, true);
	assert.equal(pass.typecheck.exitCode, 0);
	assert.match(pass.typecheck.outputTail, /typecheck clean/);
	assert.equal(pass.typecheck.command, "node -e console.log('typecheck clean')");

	const fail = await runValidationChecks(process.cwd(), nodePlan({ typecheck: ['node', '-e', "console.error('TS2345 boom'); process.exit(2)"] }));
	assert.equal(fail.typecheck.ok, false);
	assert.equal(fail.typecheck.exitCode, 2);
	assert.equal(fail.typecheck.timedOut, false);
	assert.match(fail.typecheck.outputTail, /TS2345 boom/);

	const missing = await runValidationChecks(process.cwd(), nodePlan({ typecheck: ['definitely-not-a-command-xyz'] }));
	assert.equal(missing.typecheck.ok, false);
	assert.match(missing.typecheck.note ?? '', /could not start/);
});

test('a command past its limit is reported timedOut and its whole process group, grandchild included, is gone', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-validate-timeout-'));
	const pidFile = join(dir, 'grandchild.pid');
	try {
		const script = `const g = require('child_process').spawn('sleep', ['300'], { stdio: 'inherit' }); require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(g.pid)); setInterval(() => {}, 1000);`;
		const r = await runValidationChecks(process.cwd(), nodePlan({ typecheck: ['node', '-e', script], typecheckTimeoutMs: 1_500 }));
		assert.equal(r.typecheck.ok, false);
		assert.equal(r.typecheck.timedOut, true);
		assert.match(r.typecheck.note ?? '', /timed out after 2 s|timed out after 1 s/);
		assert.ok(existsSync(pidFile));
		const pid = Number(readFileSync(pidFile, 'utf8'));
		const until = Date.now() + 2_000;
		while (isAlive(pid) && Date.now() < until) await new Promise(res => setTimeout(res, 25));
		assert.equal(isAlive(pid), false, `grandchild ${pid} outlived the timed-out check`);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a test file that keeps its process alive after its tests pass still finishes under --test-force-exit', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-validate-forceexit-'));
	try {
		writeFileSync(join(dir, 'lingers.test.mjs'),
			"import { test } from 'node:test';\ntest('passes, then leaves a timer running', () => { setInterval(() => {}, 1000); });\n");
		const r = await runValidationChecks(dir, nodePlan({ testFiles: ['lingers.test.mjs'], testTimeoutMs: 15_000 }));
		assert.equal(r.tests.timedOut, false, 'not killed by the time limit');
		assert.equal(r.tests.ok, true);
		assert.equal(r.tests.exitCode, 0);
		assert.ok(r.tests.durationMs < 15_000);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unresolved test name makes tests fail with a note naming it', async () => {
	const none = await runValidationChecks(process.cwd(), nodePlan({ unresolvedTests: ["ghost.test.ts: 'x'"] }));
	assert.equal(none.tests.ok, false);
	assert.match(none.tests.note ?? '', /ghost\.test\.ts: 'x'/);
	assert.equal(none.tests.command, '');

	const dir = mkdtempSync(join(tmpdir(), 'insrc-validate-unresolved-'));
	try {
		writeFileSync(join(dir, 'ok.test.mjs'), "import { test } from 'node:test';\ntest('ok', () => {});\n");
		const some = await runValidationChecks(dir, nodePlan({ testFiles: ['ok.test.mjs'], unresolvedTests: ["ghost.test.ts: 'x'"] }));
		assert.equal(some.tests.exitCode, 0, 'the resolved file still ran and passed');
		assert.equal(some.tests.ok, false, 'but an unresolved planned test fails the check');
		assert.match(some.tests.note ?? '', /ghost\.test\.ts/);
	} finally { rmSync(dir, { recursive: true, force: true }); }

	const trivialNone = await runValidationChecks(process.cwd(), nodePlan({ noTests: { ok: true, note: 'no tests named for a trivial build' } }));
	assert.equal(trivialNone.tests.ok, true);
	assert.equal(trivialNone.tests.note, 'no tests named for a trivial build');
});

test('a trivial build that deletes a test file does not ask to run it', () => {
	const repo = gitRepo(TREE);
	try {
		execFileSync('git', ['rm', '-q', 'src/b/__tests__/chain.test.ts'], { cwd: repo });
		writeFileSync(join(repo, 'src/a/__tests__/notice.test.ts'), '// changed');
		execFileSync('git', ['add', '.'], { cwd: repo });
		execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'delete one test, change another'], { cwd: repo, stdio: 'ignore' });
		assert.deepEqual(trivialCheckPlan(repo).testFiles, ['src/a/__tests__/notice.test.ts']);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

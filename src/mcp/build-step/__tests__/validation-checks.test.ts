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
		testFiles: [], unresolvedTests: [], namedTests: [],
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

// ---------------------------------------------------------------------------
// The builder's mapping in the check plans (LLD-9b4a74dc-S001, task t6)
// ---------------------------------------------------------------------------

const NOTICE = 'src/a/__tests__/notice.test.ts';
const CHAIN = 'src/b/__tests__/chain.test.ts';

test("with no mapping, planTaskCheckPlan and smallStandaloneCheckPlan return the same testFiles, unresolvedTests and noTests as before, and namedTests marks each name 'prefix' or 'none'", () => {
	const repo = gitRepo(TREE);
	try {
		const tests = [{ level: 'unit', name: "notice.test.ts: 'a'" }, { level: 'integration', name: 'a prose name' }, { name: "driver-unit.test.ts: 'b'" }];
		const before = (names: string[]) => resolveTaskTestFiles(repo, names);
		const plan = planTaskCheckPlan(repo, { tests });
		assert.deepEqual(plan.testFiles, before(tests.map(t => t.name)).files);
		assert.deepEqual(plan.unresolvedTests, before(tests.map(t => t.name)).unresolved);
		assert.deepEqual(plan.unresolvedTests, ['a prose name']);
		assert.equal(plan.noTests, undefined);
		assert.deepEqual(plan.namedTests, [
			{ name: "notice.test.ts: 'a'", level: 'unit', source: 'prefix', cases: [], files: [NOTICE] },
			{ name: 'a prose name', level: 'integration', source: 'none', cases: [], files: [] },
			{ name: "driver-unit.test.ts: 'b'", source: 'prefix', cases: [], files: ['src/a/__tests__/driver-unit.test.ts', 'src/b/__tests__/driver-unit.test.ts'] },
		]);
		// An explicitly empty mapping is no mapping.
		assert.deepEqual(planTaskCheckPlan(repo, { tests }, []), plan);
		assert.deepEqual(planTaskCheckPlan(repo, { tests: [] }).namedTests, []);

		const small = smallStandaloneCheckPlan(repo, { testLevels: [{ level: 'unit', subjects: ["chain.test.ts: 'x'", 'prose with no file'] }, { subjects: ["ghost.test.ts: 'y'"] }] });
		assert.deepEqual(small.testFiles, [CHAIN]);
		assert.deepEqual(small.unresolvedTests, ["ghost.test.ts: 'y'"]);
		assert.equal(small.noTests, undefined);
		assert.deepEqual(small.namedTests.map(n => `${n.source} ${n.level ?? '-'} ${n.name}`), ["prefix unit chain.test.ts: 'x'", 'none unit prose with no file', "none - ghost.test.ts: 'y'"]);
		const proseOnly = smallStandaloneCheckPlan(repo, { testLevels: [{ subjects: ['prose only'] }] });
		assert.deepEqual([proseOnly.testFiles, proseOnly.unresolvedTests, proseOnly.noTests], [[], [], { ok: false, note: 'the LLD names no test file' }]);
		assert.deepEqual(smallStandaloneCheckPlan(repo, undefined).noTests, { ok: false, note: 'the LLD names no test file' });
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test("with a mapping, a name with no prefix is no longer unresolved, its files are in testFiles once, and a name with both a mapping and a prefix uses the mapping (mutation: keep the prefix's files as well)", () => {
	const repo = gitRepo(TREE);
	try {
		const tests = [
			{ level: 'unit', name: 'a prose name' },
			{ level: 'unit', name: "driver-unit.test.ts: 'has a prefix AND a mapping'" },
			{ level: 'unit', name: "chain.test.ts: 'prefix only'" },
			{ level: 'unit', name: 'prose nobody mapped' },
			{ level: 'live', name: 'a live run' },
		];
		const plan = planTaskCheckPlan(repo, { tests }, [
			{ name: 'a prose name', cases: [{ file: NOTICE, title: 't1' }, { file: NOTICE, title: 't2' }, { file: CHAIN, title: 't3' }] },
			{ name: "driver-unit.test.ts: 'has a prefix AND a mapping'", cases: [{ file: NOTICE, title: 't4' }] },
			{ name: 'a live run', reported: { result: 'pass', evidence: 'run 7' } },
		]);
		// Each file once; the mapped name's own prefix (two driver-unit files) is NOT used.
		assert.deepEqual(plan.testFiles, [NOTICE, CHAIN]);
		assert.deepEqual(plan.unresolvedTests, ['prose nobody mapped']);
		assert.deepEqual(plan.namedTests, [
			{ name: 'a prose name', level: 'unit', source: 'mapping', cases: [{ file: NOTICE, title: 't1' }, { file: NOTICE, title: 't2' }, { file: CHAIN, title: 't3' }], files: [NOTICE, CHAIN] },
			{ name: "driver-unit.test.ts: 'has a prefix AND a mapping'", level: 'unit', source: 'mapping', cases: [{ file: NOTICE, title: 't4' }], files: [NOTICE] },
			{ name: "chain.test.ts: 'prefix only'", level: 'unit', source: 'prefix', cases: [], files: [CHAIN] },
			{ name: 'prose nobody mapped', level: 'unit', source: 'none', cases: [], files: [] },
			// A reported result and no cases: nothing to run, and not unresolved.
			{ name: 'a live run', level: 'live', source: 'mapping', cases: [], files: [], reported: { result: 'pass', evidence: 'run 7' } },
		]);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test("smallStandaloneCheckPlan with a mapping and no prefixed subject runs the mapped files and is not 'the LLD names no test file'; an unmapped prose subject is listed as not mapped and does not fail", () => {
	const repo = gitRepo(TREE);
	try {
		const strategy = { testLevels: [{ level: 'unit', subjects: ['prose one', 'prose two'] }, { level: 'contract', subjects: ['prose three'] }] };
		const plan = smallStandaloneCheckPlan(repo, strategy, [{ name: 'prose one', cases: [{ file: NOTICE, title: 't' }] }]);
		assert.equal(plan.noTests, undefined);
		assert.deepEqual(plan.testFiles, [NOTICE]);
		assert.deepEqual(plan.unresolvedTests, [], 'an unmapped prose subject does not fail the check');
		assert.deepEqual(plan.namedTests.map(n => `${n.source} ${n.level} ${n.name}`), ['mapping unit prose one', 'none unit prose two', 'none contract prose three']);
		// A mapping that carries only a reported result still counts as one.
		const reportedOnly = smallStandaloneCheckPlan(repo, { testLevels: [{ level: 'live', subjects: ['a live one'] }] }, [{ name: 'a live one', reported: { result: 'pass', evidence: 'e' } }]);
		assert.equal(reportedOnly.noTests, undefined);
		assert.deepEqual(reportedOnly.testFiles, []);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// The runner, file by file and case by case (LLD-9b4a74dc-S001, task t7)
// ---------------------------------------------------------------------------

const PASSING = "import { test } from 'node:test';\ntest('alpha passes', () => {});\ntest('beta passes', () => {});\n";
const MIXED = [
	"import { test, describe, it } from 'node:test';",
	"import assert from 'node:assert/strict';",
	"test('one passes', () => {});",
	"test('two fails', () => { assert.fail('boom'); });",
	"test('three is skipped', { skip: 'needs an env' }, () => {});",
	"describe('a suite', () => { it('nested passes', () => {}); });",
	"test('an unrelated failure', () => { assert.fail('other'); });",
	'',
].join('\n');

function runnerDir(files: Readonly<Record<string, string>>): string {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-validate-runner-'));
	for (const [rel, body] of Object.entries(files)) writeFileSync(join(dir, rel), body);
	return dir;
}
const mapped = (name: string, cases: { file: string; title: string }[], level = 'unit') =>
	({ name, level, source: 'mapping' as const, cases, files: [...new Set(cases.map(c => c.file))] });

test('runValidationChecks runs each file in its own process, in order, with the TAP reporter, and returns per file its exit code and titles (mutation: run all files in one command)', async () => {
	const dir = runnerDir({ 'a.test.mjs': PASSING, 'b.test.mjs': MIXED });
	try {
		const calls: string[][] = [];
		const { runInProcessGroup } = await import('../../../shared/process-group.js');
		const r = await runValidationChecks(dir, nodePlan({ testFiles: ['a.test.mjs', 'b.test.mjs'] }), {
			run: (command, args, opts) => { calls.push([command, ...args]); return runInProcessGroup(command, args, opts); },
		});
		// One process per file (after the typecheck), in the plan's order, each with the reporter.
		assert.deepEqual(calls.slice(1), [
			['node', '--test', '--test-force-exit', '--test-reporter=tap', 'a.test.mjs'],
			['node', '--test', '--test-force-exit', '--test-reporter=tap', 'b.test.mjs'],
		]);
		const files = r.tests.files!;
		assert.deepEqual(files.map(f => [f.file, f.exitCode, f.timedOut]), [['a.test.mjs', 0, false], ['b.test.mjs', 1, false]]);
		assert.deepEqual(files[0]!.titles.map(t => `${t.result} ${t.title}`), ['pass alpha passes', 'pass beta passes']);
		// The second file's titles are its own: nothing of the first file's is among them.
		assert.deepEqual(files[1]!.titles.map(t => `${t.depth} ${t.result} ${t.title}`), [
			'0 pass one passes', '0 fail two fails', '0 skipped three is skipped', '1 pass nested passes', '0 pass a suite', '0 fail an unrelated failure',
		]);
		assert.equal(r.tests.command, 'node --test --test-force-exit --test-reporter=tap a.test.mjs\nnode --test --test-force-exit --test-reporter=tap b.test.mjs');
		assert.equal(r.tests.ok, false);
		assert.equal(r.tests.exitCode, 1);
		// The tail of the output is still returned for the judge.
		assert.match(r.tests.outputTail, /# fail 2/);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a mapped case that passes, one that fails, one that is skipped and one whose title is not in the file get those four results, and the check is not ok when any is fail, skipped or not found (mutations: count not found as pass; count skipped as pass)', async () => {
	const dir = runnerDir({ 'a.test.mjs': PASSING, 'b.test.mjs': MIXED });
	try {
		const run = (namedTests: ValidationCheckPlan['namedTests'], testFiles: string[]) => runValidationChecks(dir, nodePlan({ testFiles, namedTests }));
		const all = await run([mapped('the planned test', [
			{ file: 'b.test.mjs', title: 'one passes' }, { file: 'b.test.mjs', title: 'two fails' },
			{ file: 'b.test.mjs', title: 'three is skipped' }, { file: 'b.test.mjs', title: 'no such title' },
			{ file: 'b.test.mjs', title: 'nested passes' }, { file: 'a.test.mjs', title: 'alpha passes' },
			// A title of ANOTHER file is not found in this one.
			{ file: 'a.test.mjs', title: 'one passes' },
		])], ['a.test.mjs', 'b.test.mjs']);
		assert.deepEqual(all.tests.namedTests![0]!.cases.map(c => c.result), ['pass', 'fail', 'skipped', 'not found', 'pass', 'pass', 'not found']);
		assert.equal(all.tests.ok, false);

		// Each bad result ALONE fails the check, in a file that exits with 0.
		const pass = await run([mapped('p', [{ file: 'a.test.mjs', title: 'alpha passes' }, { file: 'a.test.mjs', title: 'beta passes' }])], ['a.test.mjs']);
		assert.deepEqual([pass.tests.ok, pass.tests.exitCode, pass.tests.note], [true, 0, undefined]);
		const notFound = await run([mapped('p', [{ file: 'a.test.mjs', title: 'alpha passes' }, { file: 'a.test.mjs', title: 'gone' }])], ['a.test.mjs']);
		assert.deepEqual([notFound.tests.ok, notFound.tests.exitCode], [false, 0]);
		assert.match(notFound.tests.note ?? '', /named test cases that did not pass: not found: 'gone' in a\.test\.mjs/);
		const skipDir = runnerDir({ 's.test.mjs': "import { test } from 'node:test';\ntest('runs', () => {});\ntest('env only', { skip: true }, () => {});\n" });
		try {
			const skipped = await runValidationChecks(skipDir, nodePlan({ testFiles: ['s.test.mjs'], namedTests: [mapped('p', [{ file: 's.test.mjs', title: 'runs' }, { file: 's.test.mjs', title: 'env only' }])] }));
			assert.deepEqual(skipped.tests.namedTests![0]!.cases.map(c => c.result), ['pass', 'skipped']);
			assert.deepEqual([skipped.tests.ok, skipped.tests.exitCode], [false, 0], 'a skipped case does not satisfy its test');
			assert.match(skipped.tests.note ?? '', /skipped: 'env only' in s\.test\.mjs/);
		} finally { rmSync(skipDir, { recursive: true, force: true }); }
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a file that exits non-zero while its mapped cases pass fails the check and lists the other failing titles', async () => {
	const dir = runnerDir({ 'b.test.mjs': MIXED });
	try {
		const r = await runValidationChecks(dir, nodePlan({ testFiles: ['b.test.mjs'], namedTests: [mapped('p', [{ file: 'b.test.mjs', title: 'one passes' }, { file: 'b.test.mjs', title: 'nested passes' }])] }));
		assert.deepEqual(r.tests.namedTests![0]!.cases.map(c => c.result), ['pass', 'pass']);
		assert.equal(r.tests.files![0]!.exitCode, 1);
		assert.equal(r.tests.ok, false);
		// The failures outside the named cases are in the file's titles, for the record and the judge.
		assert.deepEqual(r.tests.files![0]!.titles.filter(t => t.result === 'fail').map(t => t.title), ['two fails', 'an unrelated failure']);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a file that times out, and a file not started because the time limit was used up, are recorded with that note, their cases are not found, and the check is not ok', async () => {
	const dir = runnerDir({ 'hang.test.mjs': "import { test } from 'node:test';\ntest('hangs', async () => { await new Promise(() => { setInterval(() => {}, 1000); }); });\n", 'a.test.mjs': PASSING });
	try {
		const r = await runValidationChecks(dir, nodePlan({
			testFiles: ['hang.test.mjs', 'a.test.mjs'], testTimeoutMs: 1_500,
			namedTests: [mapped('p', [{ file: 'hang.test.mjs', title: 'hangs' }, { file: 'a.test.mjs', title: 'alpha passes' }])],
		}));
		const [hang, later] = r.tests.files!;
		assert.deepEqual([hang!.timedOut, hang!.exitCode], [true, null]);
		assert.match(hang!.note ?? '', /timed out after [12] s/);
		// The second file was never started: the one limit covers all the files together.
		assert.deepEqual([later!.timedOut, later!.exitCode, later!.durationMs, later!.titles.length], [true, null, 0, 0]);
		assert.equal(later!.note, 'not run: the time limit was used up');
		assert.deepEqual(r.tests.namedTests![0]!.cases.map(c => c.result), ['not found', 'not found']);
		assert.deepEqual([r.tests.ok, r.tests.timedOut], [false, true]);
		assert.match(r.tests.note ?? '', /a\.test\.mjs: not run: the time limit was used up/);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a run's whole output is written to a file and its path returned, with nothing cut; when that file cannot be written the results stand and the entry carries a note", async () => {
	// A file whose output is far longer than the tail the verdict keeps: its first
	// test is named, and its second prints two hundred long lines. (Two tests,
	// not hundreds: `--test-force-exit` drops trailing tests of a file with many,
	// now and then, and still exits with 0.)
	const long = "import { test } from 'node:test';\ntest('the first case', () => {});\ntest('a noisy one', () => { for (let i = 0; i < 200; i++) console.log('line ' + i + ' ' + 'x'.repeat(100)); });\n";
	const dir = runnerDir({ 'long.test.mjs': long });
	try {
		const r = await runValidationChecks(dir, nodePlan({ testFiles: ['long.test.mjs'], namedTests: [mapped('p', [{ file: 'long.test.mjs', title: 'the first case' }])] }));
		const run = r.tests.files![0]!;
		assert.ok(run.outputPath !== undefined && existsSync(run.outputPath));
		const whole = readFileSync(run.outputPath!, 'utf8');
		assert.ok(whole.length > 20_000, `the whole output is long (${whole.length})`);
		assert.ok(whole.startsWith('TAP version 13'));
		assert.ok(whole.includes('ok 1 - the first case') && whole.includes('line 0 xxx') && whole.includes('line 199 xxx') && whole.includes('ok 2 - a noisy one'));
		assert.ok(r.tests.outputTail.length <= 4_000, 'the tail in the verdict is still short');
		assert.ok(!r.tests.outputTail.includes('line 0 xxx'), 'the start of the output is beyond the tail');
		// The results are read from the whole output, not from the tail.
		assert.deepEqual(r.tests.namedTests![0]!.cases.map(c => c.result), ['pass']);
		assert.equal(r.tests.ok, true);
		rmSync(run.outputPath!, { force: true });

		const { runInProcessGroup } = await import('../../../shared/process-group.js');
		const failing = await runValidationChecks(dir, nodePlan({ testFiles: ['long.test.mjs'], namedTests: [mapped('p', [{ file: 'long.test.mjs', title: 'a noisy one' }])] }), {
			run: runInProcessGroup, writeOutput: () => { throw new Error('disk full'); },
		});
		assert.equal(failing.tests.files![0]!.outputPath, undefined);
		assert.match(failing.tests.files![0]!.note ?? '', /the whole output could not be written to a file: disk full/);
		assert.deepEqual(failing.tests.namedTests![0]!.cases.map(c => c.result), ['pass'], 'the results stand');
		assert.equal(failing.tests.files![0]!.exitCode, 0);
		assert.equal(failing.tests.ok, true);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a reported pass on a live test runs nothing and leaves the check's result to the other tests; a reported fail makes the check not ok; a Task whose tests are all reported as pass runs no file and passes with the note, while a Task with no file and an unreported name still fails (mutation: fail every run that has no file)", async () => {
	const dir = runnerDir({ 'a.test.mjs': PASSING });
	try {
		const live = (result: 'pass' | 'fail', name = 'a live run') => ({ name, level: 'live', source: 'mapping' as const, cases: [], files: [], reported: { result, evidence: 'run 7 in the build record' } });
		const unit = mapped('u', [{ file: 'a.test.mjs', title: 'alpha passes' }]);
		const calls: string[] = [];
		const { runInProcessGroup } = await import('../../../shared/process-group.js');
		const deps = { run: (c: string, a: readonly string[], o: Parameters<typeof runInProcessGroup>[2]) => { calls.push(a.join(' ')); return runInProcessGroup(c, a, o); } };

		// Beside a passing unit test: the reported pass changes nothing and runs nothing.
		const withUnit = await runValidationChecks(dir, nodePlan({ testFiles: ['a.test.mjs'], namedTests: [unit, live('pass')] }), deps);
		assert.equal(withUnit.tests.ok, true);
		assert.equal(calls.filter(c => c.includes('--test-reporter')).length, 1);
		assert.deepEqual(withUnit.tests.namedTests![1], { name: 'a live run', level: 'live', source: 'mapping', cases: [], files: [], reported: { result: 'pass', evidence: 'run 7 in the build record' } });
		// Beside a FAILING case it does not rescue the check.
		const withBad = await runValidationChecks(dir, nodePlan({ testFiles: ['a.test.mjs'], namedTests: [mapped('u', [{ file: 'a.test.mjs', title: 'gone' }]), live('pass')] }));
		assert.equal(withBad.tests.ok, false);
		// A reported fail fails the check, with files and without.
		const reportedFail = await runValidationChecks(dir, nodePlan({ testFiles: ['a.test.mjs'], namedTests: [unit, live('fail')] }));
		assert.deepEqual([reportedFail.tests.ok, reportedFail.tests.exitCode], [false, 0]);
		assert.match(reportedFail.tests.note ?? '', /reported as failed by the builder: a live run/);
		const onlyFail = await runValidationChecks(dir, nodePlan({ namedTests: [live('pass', 'one'), live('fail', 'two')] }));
		assert.equal(onlyFail.tests.ok, false);

		// All reported as pass: no file is run, and the check passes with the note.
		calls.length = 0;
		const allReported = await runValidationChecks(dir, nodePlan({ namedTests: [live('pass', 'one'), live('pass', 'two')] }), deps);
		assert.deepEqual([allReported.tests.ok, allReported.tests.command], [true, '']);
		assert.equal(allReported.tests.note, 'the gate ran no test: every named test of this Task was reported by the builder');
		assert.equal(calls.filter(c => c.includes('--test-reporter')).length, 0);
		assert.deepEqual(allReported.tests.files, []);
		// No file, and a name that is neither run nor reported: still fails, as before.
		const unreported = await runValidationChecks(dir, nodePlan({ unresolvedTests: ['a prose name'], namedTests: [live('pass'), { name: 'a prose name', level: 'unit', source: 'none', cases: [], files: [] }] }));
		assert.equal(unreported.tests.ok, false);
		assert.match(unreported.tests.note ?? '', /named tests matched no test file: a prose name \(pass a `tests` mapping at the validate turn/);
		const nothing = await runValidationChecks(dir, nodePlan({}));
		assert.deepEqual([nothing.tests.ok, nothing.tests.note], [false, 'no test files to run']);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test("trivialCheckPlan marks each touched file 'touched' and the result lists every title of each file", async () => {
	const repo = gitRepo({ 'src/a/__tests__/one.test.ts': "import { test } from 'node:test';\ntest('first', () => {});\ntest('second', () => {});\n", 'src/a/x.ts': '' });
	try {
		const plan = trivialCheckPlan(repo);
		assert.deepEqual(plan.namedTests, [{ name: 'src/a/__tests__/one.test.ts', source: 'touched', cases: [], files: ['src/a/__tests__/one.test.ts'] }]);
		const r = await runValidationChecks(repo, { ...plan, typecheck: ['node', '-e', 'process.exit(0)'], testCommand: ['node', '--experimental-strip-types', '--test', '--test-force-exit'] });
		assert.deepEqual(r.tests.files!.map(f => [f.file, f.exitCode, f.titles.map(t => `${t.result} ${t.title}`)]), [['src/a/__tests__/one.test.ts', 0, ['pass first', 'pass second']]]);
		assert.deepEqual(r.tests.namedTests, [{ name: 'src/a/__tests__/one.test.ts', source: 'touched', cases: [], files: ['src/a/__tests__/one.test.ts'] }]);
		assert.equal(r.tests.ok, true);
		// No touched test file: acceptable as before, with nothing named.
		writeFileSync(join(repo, 'README.md'), 'x');
		execFileSync('git', ['add', 'README.md'], { cwd: repo });
		execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'readme'], { cwd: repo, stdio: 'ignore' });
		assert.deepEqual(trivialCheckPlan(repo).namedTests, []);
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

// --- from the code review of the Story (CR-9b4a74dc-S001) ---------------------

test('a file whose output is not TAP fails the check even when it exits with 0 and no case is named for it', async () => {
	const notTap = async (): Promise<{ stdout: string; stderr: string; exitCode: number; timedOut: boolean; durationMs: number }> =>
		({ stdout: 'something ran, and printed no test report\n', stderr: '', exitCode: 0, timedOut: false, durationMs: 3 });
	const byFile = (source: 'prefix' | 'touched') => ({ name: 'x.test.ts: by file', level: 'unit', source, cases: [], files: ['x.test.ts'] });
	for (const source of ['prefix', 'touched'] as const) {
		const r = await runValidationChecks('/nowhere', nodePlan({ testFiles: ['x.test.ts'], namedTests: [byFile(source)] }), { run: notTap, writeOutput: () => '/tmp/out.tap' });
		assert.deepEqual([r.tests.files![0]!.exitCode, r.tests.files![0]!.understood, r.tests.files![0]!.titles.length], [0, false, 0], source);
		assert.match(r.tests.files![0]!.note ?? '', /the output of the run was not understood as TAP/);
		assert.equal(r.tests.ok, false, `${source}: exit code 0 with no report is not a pass`);
	}
	// With a case named, it fails as before, through 'not found'.
	const mappedRun = await runValidationChecks('/nowhere', nodePlan({ testFiles: ['x.test.ts'], namedTests: [mapped('p', [{ file: 'x.test.ts', title: 't' }])] }), { run: notTap, writeOutput: () => '/tmp/out.tap' });
	assert.deepEqual([mappedRun.tests.ok, mappedRun.tests.namedTests![0]!.cases[0]!.result], [false, 'not found']);
	// A real report is understood, and the field is then absent.
	const dir = runnerDir({ 'a.test.mjs': PASSING });
	try {
		const real = await runValidationChecks(dir, nodePlan({ testFiles: ['a.test.mjs'], namedTests: [{ name: 'a.test.mjs', source: 'touched', cases: [], files: ['a.test.mjs'] }] }));
		assert.deepEqual([real.tests.ok, real.tests.files![0]!.understood], [true, undefined]);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

test("a line a test prints that looks like a result line, or like the start of a YAML block, is not read as one: the runner reports a test's output as comments", async () => {
	const forging = [
		"import { test } from 'node:test';",
		"test('the real one', () => {",
		"  console.log('ok 9 - a forged title');",
		"  console.log('---');",
		"  process.stdout.write('not ok 3 - a forged failure\\n');",
		"  console.error('ok 7 - forged on stderr');",
		'});',
		"test('after the dashes', () => {});",
		'',
	].join('\n');
	const dir = runnerDir({ 'forge.test.mjs': forging });
	try {
		const r = await runValidationChecks(dir, nodePlan({ testFiles: ['forge.test.mjs'], namedTests: [mapped('p', [
			{ file: 'forge.test.mjs', title: 'the real one' }, { file: 'forge.test.mjs', title: 'after the dashes' },
			{ file: 'forge.test.mjs', title: 'a forged title' }, { file: 'forge.test.mjs', title: 'forged on stderr' }, { file: 'forge.test.mjs', title: 'a forged failure' },
		])] }));
		// Only the two real tests are titles; a printed '---' did not swallow the second.
		assert.deepEqual(r.tests.files![0]!.titles.map(t => `${t.result} ${t.title}`), ['pass the real one', 'pass after the dashes']);
		assert.deepEqual(r.tests.namedTests![0]!.cases.map(c => c.result), ['pass', 'pass', 'not found', 'not found', 'not found']);
		// The printed lines are in the whole output, as comments.
		const whole = readFileSync(r.tests.files![0]!.outputPath!, 'utf8');
		assert.ok(whole.includes('# ok 9 - a forged title') && whole.includes('# ---') && whole.includes('# not ok 3 - a forged failure'));
	} finally { rmSync(dir, { recursive: true, force: true }); }
});

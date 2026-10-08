/**
 * A Story's test record (LLD-9b4a74dc-S001, task t3): its merge, its paths and
 * its document. Pure filesystem: a temporary repo with `.insrc/artifacts`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { persistBuildRecord } from '../standalone-record.js';
import {
	persistTestRecordTask, readTestRecord, renderTestRecordMd, storedMappingFor, testRecordPaths, testRecordTotals,
	type TestRecord, type TestRecordTask,
} from '../test-record.js';
import { artifactJsonPath, storyRecordFolderArgs, testsArtifactId } from '../../../storage.js';

const HASH = 'abc123def4567890';
const T0 = '2026-03-01T10:00:00.000Z';
const T1 = '2026-03-02T11:00:00.000Z';
const T2 = '2026-03-03T12:00:00.000Z';

async function withRepo(fn: (repo: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-test-record-'));
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	try { await fn(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

function writeArtifact(repo: string, id: string, meta: Record<string, unknown>): void {
	writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify({ meta, body: {} }));
}

const X = 'src/a/__tests__/x.test.ts';
const Y = 'src/a/__tests__/y.test.ts';

function task(taskId: string, over: Partial<TestRecordTask> = {}): TestRecordTask {
	return {
		taskId, commit: 'abc1234', ranAt: T0, testsPassed: true,
		tests: [
			{ name: 'the first named test', level: 'unit', source: 'mapping', files: [], cases: [
				{ file: X, title: 'adds | two numbers', result: 'pass' },
				{ file: Y, title: 'refuses a negative', result: 'fail' },
			] },
		],
		files: [
			{ file: X, exitCode: 0, timedOut: false, durationMs: 1234, otherFailures: [], titles: [{ title: 'adds | two numbers', result: 'pass' }] },
			{ file: Y, exitCode: 1, timedOut: false, durationMs: 40, otherFailures: ['an unrelated one'], titles: [{ title: 'refuses a negative', result: 'fail' }, { title: 'an unrelated one', result: 'fail' }] },
		],
		...over,
	};
}

test('the first write creates the record with one Task; a second Task is added; writing the first Task again replaces its entry only and keeps createdAt', async () => {
	await withRepo((repo) => {
		assert.equal(readTestRecord(repo, HASH, 's1'), null);
		const first = persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T0 }, task('t1'));
		assert.equal(first.json, artifactJsonPath(repo, testsArtifactId(HASH, 's1')));
		assert.equal(basename(first.json), `TESTS-${HASH}-s1.json`);
		let rec = readTestRecord(repo, HASH, 's1')!;
		assert.deepEqual(rec.meta, { workflow: 'tests', epicHash: HASH, storyId: 's1', createdAt: T0, updatedAt: T0 });
		assert.deepEqual(rec.body.tasks.map(t => t.taskId), ['t1']);
		// Each Task's entry carries the commit and time of its run and testsPassed.
		assert.deepEqual([rec.body.tasks[0]!.commit, rec.body.tasks[0]!.ranAt, rec.body.tasks[0]!.testsPassed], ['abc1234', T0, true]);

		persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T1 }, task('t2', { ranAt: T1, commit: 'def5678' }));
		rec = readTestRecord(repo, HASH, 's1')!;
		assert.deepEqual(rec.body.tasks.map(t => t.taskId), ['t1', 't2']);
		assert.deepEqual([rec.meta.createdAt, rec.meta.updatedAt], [T0, T1]);

		// The first Task again: its entry is replaced IN PLACE, the other is untouched.
		const t2Before = JSON.stringify(rec.body.tasks[1]);
		persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T2 }, task('t1', { ranAt: T2, commit: 'fff0000', testsPassed: false, tests: [] }));
		rec = readTestRecord(repo, HASH, 's1')!;
		assert.deepEqual(rec.body.tasks.map(t => t.taskId), ['t1', 't2']);
		assert.deepEqual([rec.body.tasks[0]!.commit, rec.body.tasks[0]!.ranAt, rec.body.tasks[0]!.testsPassed, rec.body.tasks[0]!.tests.length], ['fff0000', T2, false, 0]);
		assert.equal(JSON.stringify(rec.body.tasks[1]), t2Before);
		assert.deepEqual([rec.meta.createdAt, rec.meta.updatedAt], [T0, T2]);
	});
});

test("the json is TESTS-<epicHash>-<storyId>.json and the document is TESTS.md in the same folder as the Story's BUILD.md, for an Epic's Story and for a standalone one (mutation: derive the folder from the record's own time)", async () => {
	// An Epic's Story: the definition head names and dates the folder, not the record's own time.
	await withRepo((repo) => {
		writeArtifact(repo, `DEF-${HASH}`, { epicSlug: 'pay-things', createdAt: '2026-01-15T00:00:00.000Z' });
		const tests = persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T0 }, task('t1'));
		const build = persistBuildRecord(repo, { meta: { workflow: 'build', epicHash: HASH, storyId: 's1', createdAt: T1, updatedAt: T1 }, body: { tasks: [{ id: 't1', passed: true }] } });
		assert.equal(basename(tests.json), `TESTS-${HASH}-s1.json`);
		assert.equal(basename(tests.md), 'TESTS.md');
		assert.equal(dirname(tests.md), dirname(build.md));
		assert.match(tests.md, /docs\/epics\/pay-things-E20260115abc123de\/S001\/TESTS\.md$/);
		// A later write of the record stays there.
		assert.equal(persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T2 }, task('t2')).md, tests.md);
		assert.equal(testRecordPaths(repo, HASH, 's1', { now: T2 }).md, tests.md);
	});
	// A standalone Story with a design: the LLD dates the folder.
	await withRepo((repo) => {
		writeArtifact(repo, `LLD-${HASH}-S001`, { standalone: true, epicSlug: 'small-thing', createdAt: '2026-02-10T00:00:00.000Z' });
		const tests = persistTestRecordTask(repo, { epicHash: HASH, storyId: 'S001', now: T0, standalone: true }, task('S001'));
		const build = persistBuildRecord(repo, { meta: { workflow: 'build', standalone: true, epicHash: HASH, storyId: 'S001', createdAt: T1, updatedAt: T1 }, body: { tasks: [{ id: 'S001', passed: true }] } });
		assert.equal(dirname(tests.md), dirname(build.md));
		assert.match(tests.md, /docs\/standalone\/small-thing-E20260210abc123de\/S001\/TESTS\.md$/);
		assert.equal(readTestRecord(repo, HASH, 'S001')!.meta.standalone, true);
	});
	// No build record and nothing else to anchor on: the folder comes from the
	// test record's own persisted createdAt and flag, also on a later day ...
	await withRepo((repo) => {
		const first = persistTestRecordTask(repo, { epicHash: HASH, storyId: 'S001', now: T0, standalone: true }, task('S001'));
		assert.match(first.md, /docs\/standalone\/[^/]*E20260301abc123de\/S001\/TESTS\.md$/);
		const later = persistTestRecordTask(repo, { epicHash: HASH, storyId: 'S001', now: T2 }, task('S001'));
		assert.equal(later.md, first.md);
		// ... and the shared derivation hands the same anchor to any other record writer.
		const fa = storyRecordFolderArgs(repo, HASH, 'S001', { ownCreatedAt: T2 });
		assert.deepEqual([fa.createdAtISO, fa.workItemKind], [T0, 'standalone']);
	});
	// A build record that already exists stays the anchor, and the test record follows it.
	await withRepo((repo) => {
		const build = persistBuildRecord(repo, { meta: { workflow: 'build', standalone: true, sizeClass: 'trivial', epicHash: HASH, storyId: 'S001', createdAt: T0, updatedAt: T0 }, body: { focus: 'x' } });
		const tests = persistTestRecordTask(repo, { epicHash: HASH, storyId: 'S001', now: T2 }, task('S001'));
		assert.equal(dirname(tests.md), dirname(build.md));
	});
});

test('the document shows totals, then per Task and per named test a table of result, title and file, the tests reported by the builder with their evidence, and the failures outside the named cases', async () => {
	const t2 = task('t2', { ranAt: T1, commit: undefined, testsPassed: false, note: 'The test record of an earlier run could not be read.', tests: [
		{ name: 'runs against the real daemon', level: 'live', source: 'mapping', cases: [], files: [], reported: { result: 'pass', evidence: 'run 12, build record section Live' } },
		{ name: 'x.test.ts: by file', level: 'unit', source: 'prefix', cases: [], files: [X] },
		{ name: 'a prose one nobody mapped', level: 'integration', source: 'none', cases: [], files: [] },
		{ name: 'looks for a title that is gone', level: 'unit', source: 'mapping', files: [], cases: [{ file: X, title: 'gone', result: 'not found' }, { file: X, title: 'env only', result: 'skipped' }] },
	], files: [{ file: X, exitCode: null, timedOut: true, durationMs: 600_000, otherFailures: [], titles: [], note: 'timed out after 600 s' }] });
	const rec: TestRecord = { meta: { workflow: 'tests', epicHash: HASH, storyId: 's1', createdAt: T0, updatedAt: T1 }, body: { tasks: [task('t1'), t2] } };
	assert.deepEqual(testRecordTotals(rec.body.tasks), { pass: 1, fail: 1, skipped: 1, notFound: 1, reported: 1 });
	const md = renderTestRecordMd(rec);
	const at = (s: string): number => { const i = md.indexOf(s); assert.notEqual(i, -1, `missing: ${s}`); return i; };

	// Totals first, then each Task in order.
	assert.ok(at('**Totals:** 1 pass, 1 fail, 1 skipped, 1 not found; 1 reported by the builder and not run by the gate.') < at('## t1'));
	assert.ok(at('## t1') < at('## t2'));
	at(`Run at ${T0} on commit \`abc1234\`. Tests check: **passed**. 1 pass, 1 fail, 0 skipped, 0 not found; 0 reported`);
	at(`Run at ${T1}. Tests check: **failed**.`);
	// Per named test, a table of result, title and file; a '|' in a title cannot break the row.
	at('**unit: the first named test**');
	at('| Result | Test | File |');
	at(`| pass | adds \\| two numbers | \`${X}\` |`);
	at(`| fail | refuses a negative | \`${Y}\` |`);
	at(`| not found | gone | \`${X}\` |`);
	at(`| skipped | env only | \`${X}\` |`);
	// Reported by the builder, with the evidence, and said to be not run by the gate.
	at('Reported by the builder, not run by the gate: **pass**. Evidence: run 12, build record section Live');
	// By file, not mapped, the files run, and the failures outside the named cases.
	at("Run by file: the name begins with its test file's name, and no cases were named.");
	at(`| timed out | \`${X}\` | 0 |`);
	at('Not mapped: no test case was named for this test, and nothing was run for it.');
	at(`| \`${Y}\` | 1 | 2 | 0 s |  |`);
	at(`| \`${X}\` | timed out | 0 | 600 s | timed out after 600 s |`);
	assert.ok(at('**Failures outside the named cases**') < at(`- \`${Y}\`: an unrelated one`));
	at('The test record of an earlier run could not be read.');

	// The written document carries the artifact id marker on its first line.
	await withRepo((repo) => {
		const { md: mdPath } = persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T0 }, task('t1'));
		const written = readFileSync(mdPath, 'utf8');
		assert.equal(written.split('\n')[0], `<!-- insrc:artifact TESTS-${HASH}-s1 -->`);
		assert.ok(written.endsWith(renderTestRecordMd(readTestRecord(repo, HASH, 's1')!)));
	});
	assert.match(renderTestRecordMd({ ...rec, body: { tasks: [] } }), /No Task has been validated yet\./);
});

test('the stored mapping of a Task is read back as the mapping that was supplied, and an unreadable or misshapen record reads as no stored mapping', async () => {
	await withRepo((repo) => {
		assert.equal(storedMappingFor(repo, HASH, 's1', 't1'), undefined);
		const supplied = [
			{ name: 'mapped', cases: [{ file: X, title: 'a' }, { file: Y, title: 'b' }] },
			{ name: 'reported only', reported: { result: 'pass' as const, evidence: 'the log' } },
			{ name: 'both', cases: [{ file: X, title: 'c' }], reported: { result: 'fail' as const, evidence: 'run 3' } },
		];
		persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T0 }, task('t1', { tests: [
			{ name: 'mapped', level: 'unit', source: 'mapping', files: [], cases: [{ file: X, title: 'a', result: 'pass' }, { file: Y, title: 'b', result: 'not found' }] },
			{ name: 'reported only', level: 'live', source: 'mapping', files: [], cases: [], reported: { result: 'pass', evidence: 'the log' } },
			{ name: 'both', level: 'smoke', source: 'mapping', files: [], cases: [{ file: X, title: 'c', result: 'fail' }], reported: { result: 'fail', evidence: 'run 3' } },
			// Not part of what the builder supplied:
			{ name: 'x.test.ts: by prefix', level: 'unit', source: 'prefix', files: [X], cases: [] },
			{ name: 'nothing', level: 'unit', source: 'none', files: [], cases: [] },
		] }));
		assert.deepEqual(storedMappingFor(repo, HASH, 's1', 't1'), supplied);
		// Another Task has none; a Task whose entry holds nothing mapped has none.
		assert.equal(storedMappingFor(repo, HASH, 's1', 't2'), undefined);
		persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T1 }, task('t2', { tests: [{ name: 'x.test.ts: p', source: 'prefix', files: [X], cases: [] }] }));
		assert.equal(storedMappingFor(repo, HASH, 's1', 't2'), undefined);

		// Unreadable, then misshapen: no stored mapping, no throw; and a write still succeeds over it.
		const json = artifactJsonPath(repo, testsArtifactId(HASH, 's1'));
		writeFileSync(json, '{ not json');
		assert.equal(readTestRecord(repo, HASH, 's1'), null);
		assert.equal(storedMappingFor(repo, HASH, 's1', 't1'), undefined);
		for (const misshapen of [{ meta: { epicHash: HASH, storyId: 's1', createdAt: T0 }, body: {} }, { meta: {}, body: { tasks: [] } }, { meta: { epicHash: HASH, storyId: 's1', createdAt: T0 }, body: { tasks: [{ taskId: 't1' }] } }, []]) {
			writeFileSync(json, JSON.stringify(misshapen));
			assert.equal(storedMappingFor(repo, HASH, 's1', 't1'), undefined, JSON.stringify(misshapen));
		}
		persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T2 }, task('t1'));
		assert.ok(existsSync(json));
		assert.deepEqual(readTestRecord(repo, HASH, 's1')!.body.tasks.map(t => t.taskId), ['t1']);
	});
});

// --- from the code review of the Story (CR-9b4a74dc-S001) ---------------------

test('when the document cannot be written after the json was, the json is put back: a first write leaves no record, a later one leaves the earlier run', async () => {
	const { mkdirSync: mk, rmSync: rm } = await import('node:fs');
	// First write: the document's path is taken by a directory, so its write fails.
	await withRepo((repo) => {
		const paths = testRecordPaths(repo, HASH, 's1', { now: T0 });
		mk(paths.md, { recursive: true });
		assert.throws(() => persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T0 }, task('t1')));
		assert.equal(existsSync(paths.json), false, 'no json is left behind for a record whose document was never written');
		assert.equal(readTestRecord(repo, HASH, 's1'), null);
		assert.equal(storedMappingFor(repo, HASH, 's1', 't1'), undefined);
	});
	// A later write: the first run is on disk in both files, and stays there.
	await withRepo((repo) => {
		const paths = persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T0 }, task('t1'));
		const jsonBefore = readFileSync(paths.json, 'utf8');
		const mdBefore = readFileSync(paths.md, 'utf8');
		rm(paths.md);
		mk(paths.md);
		const other = task('t1', { ranAt: T2, testsPassed: false, tests: [{ name: 'a different mapping', source: 'mapping', files: [], cases: [{ file: Y, title: 'z', result: 'fail' }] }] });
		assert.throws(() => persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T2 }, other));
		assert.equal(readFileSync(paths.json, 'utf8'), jsonBefore, 'the json is what it was before the failed write');
		// The stored mapping is the first run's, not the one whose write failed.
		assert.deepEqual(storedMappingFor(repo, HASH, 's1', 't1')!.map(e => e.name), ['the first named test']);
		rm(paths.md, { recursive: true });
		writeFileSync(paths.md, mdBefore);
		// And the record is whole again on the next write.
		persistTestRecordTask(repo, { epicHash: HASH, storyId: 's1', now: T2 }, other);
		assert.equal(readTestRecord(repo, HASH, 's1')!.body.tasks[0]!.ranAt, T2);
		assert.match(readFileSync(paths.md, 'utf8'), /a different mapping/);
	});
});

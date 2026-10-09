/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A Story's TEST RECORD (LLD-9b4a74dc-S001, task t3).
 *
 * The build validation gate runs a Task's tests itself. This record keeps what
 * it ran and what each test case did: per Task, each test the plan names, the
 * test cases (a file and a title) that carry it, and a result per case, with
 * the commit and time of the run. It is rendered as `TESTS.md` in the Story's
 * folder, beside `BUILD.md`, and its json is `TESTS-<epicHash>-<storyId>.json`.
 *
 * It is a RECORD, not an approvable artifact: it carries no approval stamps
 * and approval of it is refused. The verdict of a Task is on the BUILD record;
 * `testsPassed` here is only the result of the gate's tests check for one run.
 *
 * One entry per Task. Writing a Task again replaces that Task's entry and
 * leaves the others; the record's `createdAt` is kept from its first write,
 * because the folder of a Story with no other anchor is dated by it.
 */

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { relative } from 'node:path';

import { getLogger } from '../../../shared/logger.js';
import { artifactIdMarker, artifactJsonPath, storyRecordFolderArgs, testsArtifactId, testsArtifactPaths, writeAtomic } from '../../storage.js';

const log = getLogger('workflow:test-record');

// ---------------------------------------------------------------------------
// Shape
// ---------------------------------------------------------------------------

/** What one test case did in a run. `not found`: no test of that title ran in
 *  that file. */
export type TestCaseResult = 'pass' | 'fail' | 'skipped' | 'not found';

/** Where a named test's files come from. */
export type NamedTestSource =
	| 'mapping'   // the builder's mapping names its cases
	| 'prefix'    // the name begins with '<file>.test.ts:'
	| 'touched'   // a test file the build commit touched (trivial route)
	| 'none';     // nothing to run for it

export interface TestRecordCase {
	readonly file:   string;
	readonly title:  string;
	readonly result: TestCaseResult;
}

/** A result the builder stated for a test the gate cannot run. */
export interface TestRecordReported {
	readonly result:   'pass' | 'fail';
	readonly evidence: string;
}

/** One test the plan (or the design's test strategy) names, with what was run for it. */
export interface TestRecordNamedTest {
	readonly name:      string;
	readonly level?:    string | undefined;
	readonly source:    NamedTestSource;
	/** 'mapping': the cases the builder named, each with its result. */
	readonly cases:     readonly TestRecordCase[];
	/** 'prefix' / 'touched': the files run for it (their results are in `files`). */
	readonly files:     readonly string[];
	readonly reported?: TestRecordReported | undefined;
}

/** One test file's run. */
export interface TestRecordFile {
	readonly file:       string;
	readonly exitCode:   number | null;
	readonly timedOut:   boolean;
	readonly durationMs: number;
	/** Every test title the file reported, with its result. */
	readonly titles:     readonly { readonly title: string; readonly result: 'pass' | 'fail' | 'skipped' }[];
	/** Titles that failed and are not a named case of this Task. */
	readonly otherFailures: readonly string[];
	readonly note?:      string | undefined;
}

export interface TestRecordTask {
	readonly taskId:      string;
	/** HEAD when the gate ran. */
	readonly commit?:     string | undefined;
	readonly ranAt:       string;
	/** The result of the gate's tests check for this run; NOT the Task's verdict. */
	readonly testsPassed: boolean;
	readonly tests:       readonly TestRecordNamedTest[];
	readonly files:       readonly TestRecordFile[];
	readonly note?:       string | undefined;
}

export interface TestRecord {
	readonly meta: {
		readonly workflow:    'tests';
		readonly epicHash:    string;
		readonly storyId:     string;
		readonly createdAt:   string;
		readonly updatedAt:   string;
		/** The RESOLVED route flag (never a caller's raw declaration); only ever `true`. */
		readonly standalone?: boolean | undefined;
	};
	readonly body: { readonly tasks: readonly TestRecordTask[] };
}

/** The builder's mapping for one named test, as it was supplied. */
export interface StoredMappingEntry {
	readonly name:      string;
	readonly cases?:    readonly { readonly file: string; readonly title: string }[] | undefined;
	readonly reported?: TestRecordReported | undefined;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is TestRecord {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as { meta?: { epicHash?: unknown; storyId?: unknown; createdAt?: unknown }; body?: { tasks?: unknown } };
	return typeof r.meta?.epicHash === 'string'
		&& typeof r.meta.storyId === 'string'
		&& typeof r.meta.createdAt === 'string'
		&& Array.isArray(r.body?.tasks)
		&& (r.body.tasks as unknown[]).every(t =>
			typeof t === 'object' && t !== null
			&& typeof (t as { taskId?: unknown }).taskId === 'string'
			&& Array.isArray((t as { tests?: unknown }).tests));
}

/** What is on disk for a Story's test record: nothing, a record, or a file
 *  that cannot be used (with why). */
export type TestRecordState =
	| { readonly kind: 'absent' }
	| { readonly kind: 'record'; readonly record: TestRecord }
	| { readonly kind: 'unreadable'; readonly reason: string };

/** Read a Story's test record, telling an absent one from one that cannot be used. Never throws. */
export function testRecordState(repoPath: string, epicHash: string, storyId: string): TestRecordState {
	const jsonPath = artifactJsonPath(repoPath, testsArtifactId(epicHash, storyId));
	if (!existsSync(jsonPath)) return { kind: 'absent' };
	try {
		const parsed: unknown = JSON.parse(readFileSync(jsonPath, 'utf8'));
		if (isRecord(parsed)) return { kind: 'record', record: parsed };
		log.warn({ jsonPath }, 'testRecordState: the stored record does not have the record\'s shape; treating it as absent');
		return { kind: 'unreadable', reason: 'it does not have the record\'s shape' };
	} catch (err) {
		const reason = err instanceof Error ? err.message : String(err);
		log.warn({ jsonPath, err: reason }, 'testRecordState: the stored record is unreadable; treating it as absent');
		return { kind: 'unreadable', reason };
	}
}

/** The Story's test record, or null when there is none or it cannot be read
 *  (an unreadable or misshapen record is logged and treated as absent). */
export function readTestRecord(repoPath: string, epicHash: string, storyId: string): TestRecord | null {
	const state = testRecordState(repoPath, epicHash, storyId);
	return state.kind === 'record' ? state.record : null;
}

/**
 * The mapping stored for a Task: what the builder supplied on the turn that
 * wrote the Task's entry. `undefined` when there is no record, no entry for
 * the Task, or the entry holds nothing the builder mapped.
 */
export function storedMappingFor(repoPath: string, epicHash: string, storyId: string, taskId: string): readonly StoredMappingEntry[] | undefined {
	const task = readTestRecord(repoPath, epicHash, storyId)?.body.tasks.find(t => t.taskId === taskId);
	if (task === undefined) return undefined;
	const entries: StoredMappingEntry[] = [];
	for (const t of task.tests) {
		const mapped = t.source === 'mapping' && Array.isArray(t.cases) && t.cases.length > 0;
		if (!mapped && t.reported === undefined) continue;
		entries.push({
			name: t.name,
			...(mapped ? { cases: t.cases.map(c => ({ file: c.file, title: c.title })) } : {}),
			...(t.reported !== undefined ? { reported: { result: t.reported.result, evidence: t.reported.evidence } } : {}),
		});
	}
	return entries.length > 0 ? entries : undefined;
}

// ---------------------------------------------------------------------------
// Paths + write
// ---------------------------------------------------------------------------

function pathsFor(repoPath: string, rec: TestRecord): { md: string; json: string } {
	const { epicHash, storyId } = rec.meta;
	// The ONE folder derivation every Story record uses: the work item's
	// definition head, its LLD and its persisted BUILD record decide; this
	// record's own createdAt and flag are the fallback, for a Story that has
	// no BUILD record yet.
	const fa = storyRecordFolderArgs(repoPath, epicHash, storyId, {
		standalone:   rec.meta.standalone,
		ownCreatedAt: rec.meta.createdAt,
	});
	return testsArtifactPaths(repoPath, epicHash, storyId, fa.createdAtISO, fa.workItemKind, fa.epicSlug);
}

/** The paths of a Story's test record as it is on disk, or as a first write
 *  with these values would place it. */
export function testRecordPaths(
	repoPath: string,
	epicHash: string,
	storyId:  string,
	first:    { readonly now: string; readonly standalone?: boolean | undefined },
): { md: string; json: string } {
	const prior = readTestRecord(repoPath, epicHash, storyId);
	return pathsFor(repoPath, prior ?? {
		meta: { workflow: 'tests', epicHash, storyId, createdAt: first.now, updatedAt: first.now, ...(first.standalone === true ? { standalone: true } : {}) },
		body: { tasks: [] },
	});
}

/**
 * Write one Task's entry into the Story's test record: created on the first
 * write, the Task's entry replaced on a later one, every other entry kept.
 * `createdAt` and the route flag are kept from the first write.
 *
 * `standalone` is the RESOLVED flag the BUILD record's writer computes, never a
 * caller's raw declaration. Throws on a write failure; the caller decides what
 * that means (the gate keeps its verdict and notes it).
 */
export function persistTestRecordTask(
	repoPath: string,
	ident:    { readonly epicHash: string; readonly storyId: string; readonly now: string; readonly standalone?: boolean | undefined },
	task:     TestRecordTask,
): { md: string; json: string } {
	const prior = readTestRecord(repoPath, ident.epicHash, ident.storyId);
	const standalone = prior !== null ? prior.meta.standalone === true : ident.standalone === true;
	const kept = (prior?.body.tasks ?? []).filter(t => t.taskId !== task.taskId);
	const priorIndex = (prior?.body.tasks ?? []).findIndex(t => t.taskId === task.taskId);
	const tasks = priorIndex === -1 ? [...kept, task] : [...kept.slice(0, priorIndex), task, ...kept.slice(priorIndex)];
	const rec: TestRecord = {
		meta: {
			workflow:  'tests',
			epicHash:  ident.epicHash,
			storyId:   ident.storyId,
			createdAt: prior?.meta.createdAt ?? ident.now,
			updatedAt: ident.now,
			...(standalone ? { standalone: true } : {}),
		},
		body: { tasks },
	};
	const paths = pathsFor(repoPath, rec);
	// The json and its document are two files. If the document cannot be written
	// after the json was, the json is put back as it was (or removed, when it is
	// new): a caller told "the record was not written" must find the earlier run
	// in BOTH files, and must not find this turn's mapping stored.
	const priorJson = existsSync(paths.json) ? readFileSync(paths.json, 'utf8') : undefined;
	writeAtomic(paths.json, JSON.stringify(rec, null, 2) + '\n');
	try {
		writeAtomic(paths.md, `${artifactIdMarker(testsArtifactId(ident.epicHash, ident.storyId))}\n\n${renderTestRecordMd(rec)}`);
	} catch (err) {
		try {
			if (priorJson !== undefined) writeAtomic(paths.json, priorJson);
			else rmSync(paths.json, { force: true });
		} catch (undoErr) {
			log.warn({ json: paths.json, err: undoErr instanceof Error ? undoErr.message : String(undoErr) }, 'persistTestRecordTask: the json could not be put back after the document failed to write');
		}
		throw err;
	}
	return paths;
}

/** Repo-relative form of the record's md path, for the BUILD record's link. */
export function testRecordMdRel(repoPath: string, mdPath: string): string {
	return relative(repoPath, mdPath);
}

// ---------------------------------------------------------------------------
// Totals + document
// ---------------------------------------------------------------------------

export interface TestRecordTotals {
	readonly pass:     number;
	readonly fail:     number;
	readonly skipped:  number;
	readonly notFound: number;
	/** Results stated by the builder, not run by the gate. */
	readonly reported: number;
}

/** Totals over the mapped cases and the reported results of the given Tasks. */
export function testRecordTotals(tasks: readonly TestRecordTask[]): TestRecordTotals {
	let pass = 0, fail = 0, skipped = 0, notFound = 0, reported = 0;
	for (const task of tasks) {
		for (const t of task.tests) {
			for (const c of t.cases) {
				if (c.result === 'pass') pass += 1;
				else if (c.result === 'fail') fail += 1;
				else if (c.result === 'skipped') skipped += 1;
				else notFound += 1;
			}
			if (t.reported !== undefined) reported += 1;
		}
	}
	return { pass, fail, skipped, notFound, reported };
}

/** Text that came from the builder (a name, a title, evidence, a note): one
 *  line, so it cannot add lines that read as the record's own. */
function flat(s: string): string {
	return s.replace(/[\r\n\u2028\u2029]+/g, ' ');
}

/** A table cell: one line, no column break. */
function cell(s: string): string {
	return s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function totalsLine(t: TestRecordTotals): string {
	return `${t.pass} pass, ${t.fail} fail, ${t.skipped} skipped, ${t.notFound} not found; ${t.reported} reported by the builder and not run by the gate.`;
}

function fileResultOf(file: TestRecordFile | undefined): string {
	if (file === undefined) return 'not run';
	if (file.timedOut) return 'timed out';
	return file.exitCode === 0 ? 'pass' : 'fail';
}

export function renderTestRecordMd(rec: TestRecord): string {
	const lines: string[] = [
		`# Tests: ${rec.meta.epicHash} ${rec.meta.storyId}`,
		'',
		'What the build validation gate ran for each Task of this Story, and what each test case did. ' +
			'The gate runs the tests itself; a result here is never a builder\'s statement unless it says so. ' +
			'`not found` means no test of that title ran in that file.',
		'',
		`**Totals:** ${totalsLine(testRecordTotals(rec.body.tasks))}`,
		'',
	];
	if (rec.body.tasks.length === 0) lines.push('No Task has been validated yet.', '');

	for (const task of rec.body.tasks) {
		lines.push(
			`## ${task.taskId}`,
			'',
			`Run at ${task.ranAt}${task.commit !== undefined ? ` on commit \`${task.commit}\`` : ''}. ` +
				`Tests check: **${task.testsPassed ? 'passed' : 'failed'}**. ${totalsLine(testRecordTotals([task]))}`,
			'',
		);
		if (task.note !== undefined) lines.push(flat(task.note), '');
		if (task.tests.length === 0) lines.push('No tests were named for this Task.', '');
		const byFile = new Map(task.files.map(f => [f.file, f]));

		for (const t of task.tests) {
			lines.push(`**${t.level !== undefined ? `${flat(t.level)}: ` : ''}${flat(t.name)}**`, '');
			if (t.source === 'mapping' && t.cases.length > 0) {
				lines.push('| Result | Test | File |', '| :--- | :--- | :--- |');
				for (const c of t.cases) lines.push(`| ${c.result} | ${cell(c.title)} | \`${c.file}\` |`);
				lines.push('');
			} else if (t.source === 'prefix' || t.source === 'touched') {
				lines.push(
					t.source === 'prefix'
						? 'Run by file: the name begins with its test file\'s name, and no cases were named.'
						: 'Run by file: the build commit touched this test file.',
					'',
					'| Result | File | Titles |',
					'| :--- | :--- | :--- |',
				);
				for (const f of t.files) {
					const run = byFile.get(f);
					lines.push(`| ${fileResultOf(run)} | \`${f}\` | ${run !== undefined ? run.titles.length : 0} |`);
				}
				lines.push('');
			} else if (t.reported === undefined) {
				lines.push(t.source === 'none' ? 'Not mapped: no test case was named for this test, and nothing was run for it.' : 'No test case was named for this test.', '');
			}
			if (t.reported !== undefined) {
				lines.push(`Reported by the builder, not run by the gate: **${flat(String(t.reported.result))}**. Evidence: ${flat(t.reported.evidence)}`, '');
			}
		}

		if (task.files.length > 0) {
			lines.push('**Files run**', '', '| File | Exit code | Titles | Time | Note |', '| :--- | :--- | :--- | :--- | :--- |');
			for (const f of task.files) {
				lines.push(
					`| \`${f.file}\` | ${f.timedOut ? 'timed out' : f.exitCode ?? 'none'} | ${f.titles.length} | ` +
						`${Math.round(f.durationMs / 100) / 10} s | ${cell(f.note ?? '')} |`,
				);
			}
			lines.push('');
			const others = task.files.filter(f => f.otherFailures.length > 0);
			if (others.length > 0) {
				lines.push('**Failures outside the named cases**', '');
				for (const f of others) for (const title of f.otherFailures) lines.push(`- \`${f.file}\`: ${flat(title)}`);
				lines.push('');
			}
		}
	}
	return lines.join('\n');
}

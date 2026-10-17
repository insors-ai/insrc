/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-1102dc71 S001/t2 — what the Story's BUILD and TESTS records say about
 * its tests, as the coverage judge is shown it.
 *
 * The view is built per test FILE, from that file's latest run only:
 *
 *   - Every task's file entries take part in choosing the latest run of a file,
 *     malformed ones included, as long as they name the file. The task stored
 *     first is not necessarily the oldest: a re-run task keeps its position in
 *     the record, so the run is chosen by the task's `ranAt`. A valid `ranAt`
 *     beats a missing one; on a tie, or with no valid `ranAt`, a run whose
 *     outcome is failing (or malformed) wins, so a tie never yields a green.
 *   - The chosen run alone decides the file. A malformed latest entry is a
 *     barrier: the file is unverified, and no older run's result is shown as
 *     current. A latest run that timed out or exited non-zero is failing; one
 *     that reported no titles is unverified.
 *   - A title that appears only in an older run of the file is listed as not
 *     in the latest run, and is unverified.
 *   - An entry with no file name cannot be matched to a file; it is dropped,
 *     with a note, as is a task with no files list.
 *
 * `readTestRecord` validates only the record's top level and each task's
 * `taskId` and `tests`, so every nested field is checked here before it is read.
 */

import type { CodeReviewSubject } from '../types.js';

type TitleResult = 'pass' | 'fail' | 'skipped';

/** One test file, as its latest run decides it. */
export interface TestFileView {
	readonly file:      string;
	/** The task and time of the run that decides the file. */
	readonly decidedBy: { readonly taskId: string; readonly ranAt: string | null };
	readonly state:     'passing' | 'failing' | 'unverified';
	readonly reason?:   string | undefined;
	readonly exitCode?: number | null | undefined;
	readonly timedOut?: boolean | undefined;
	/** The latest run's titles, with their results. */
	readonly titles:    readonly { readonly title: string; readonly result: TitleResult }[];
	/** Titles an older run of the file reported and the latest run did not. Unverified. */
	readonly notInLatestRun: readonly string[];
}

/** The records' view for the coverage judge. */
export interface TestRecordView {
	readonly files: readonly TestFileView[];
	/** Each BUILD task's validate result; 'unavailable' when the record does not give one. */
	readonly buildTasks: readonly { readonly taskId: string; readonly passed: 'pass' | 'fail' | 'unavailable' }[];
	/** Parts of the records that could not be used, and why. */
	readonly notes: readonly string[];
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const TITLE_RESULTS: ReadonlySet<unknown> = new Set(['pass', 'fail', 'skipped']);

/** One file entry of one task's run. */
interface Run {
	readonly file:    string;
	readonly taskId:  string;
	readonly ranAt:   string | null;
	readonly ranAtMs: number | undefined;
	readonly entry:   Record<string, unknown>;
}

function wellFormed(entry: Record<string, unknown>): boolean {
	const titles = entry['titles'];
	const exitCode = entry['exitCode'];
	return Array.isArray(titles)
		&& titles.every(t => isPlainObject(t) && typeof t['title'] === 'string' && TITLE_RESULTS.has(t['result']))
		&& (exitCode === null || typeof exitCode === 'number')
		&& typeof entry['timedOut'] === 'boolean';
}

/** Whether a run's outcome is anything but a clean pass (a malformed entry counts as failing). */
function failingOutcome(entry: Record<string, unknown>): boolean {
	if (!wellFormed(entry)) return true;
	const titles = entry['titles'] as readonly { result: TitleResult }[];
	return entry['timedOut'] === true || entry['exitCode'] !== 0 || titles.length === 0 || titles.some(t => t.result !== 'pass');
}

/** The later of two runs of the same file, by the rule in the module comment. */
function later(a: Run, b: Run): Run {
	if (a.ranAtMs !== undefined && b.ranAtMs === undefined) return a;
	if (b.ranAtMs !== undefined && a.ranAtMs === undefined) return b;
	if (a.ranAtMs !== undefined && b.ranAtMs !== undefined && a.ranAtMs !== b.ranAtMs) return a.ranAtMs > b.ranAtMs ? a : b;
	// A tie, or neither has a time: a failing run wins.
	return failingOutcome(b.entry) && !failingOutcome(a.entry) ? b : a;
}

function fileView(latest: Run, older: readonly Run[]): TestFileView {
	const decidedBy = { taskId: latest.taskId, ranAt: latest.ranAt };
	const latestTitles = wellFormed(latest.entry) ? latest.entry['titles'] as readonly { title: string; result: TitleResult }[] : [];
	const seen = new Set(latestTitles.map(t => t.title));
	const notInLatestRun = [...new Set(older.flatMap(r => Array.isArray(r.entry['titles'])
		? (r.entry['titles'] as unknown[]).flatMap(t => isPlainObject(t) && typeof t['title'] === 'string' && !seen.has(t['title']) ? [t['title']] : [])
		: []))].sort();
	const base = { file: latest.file, decidedBy, notInLatestRun };

	if (!wellFormed(latest.entry)) {
		return { ...base, state: 'unverified', reason: 'the latest run\'s entry is malformed, so no result of this file is current', titles: [] };
	}
	const exitCode = latest.entry['exitCode'] as number | null;
	const timedOut = latest.entry['timedOut'] as boolean;
	const titles = latestTitles.map(t => ({ title: t.title, result: t.result }));
	const run = { ...base, exitCode, timedOut, titles };
	if (timedOut) return { ...run, state: 'failing', reason: 'the latest run timed out' };
	if (exitCode !== 0) return { ...run, state: 'failing', reason: `the latest run exited ${exitCode === null ? 'without an exit code' : exitCode}` };
	if (titles.length === 0) return { ...run, state: 'unverified', reason: 'the latest run reported no test titles' };
	if (titles.some(t => t.result === 'fail')) return { ...run, state: 'failing' };
	if (titles.some(t => t.result === 'skipped')) return { ...run, state: 'unverified', reason: 'a title was skipped in the latest run' };
	return { ...run, state: 'passing' };
}

function buildTasksOf(subject: CodeReviewSubject): TestRecordView['buildTasks'] {
	const tasks = subject.buildRecord?.body.tasks;
	if (tasks === undefined || tasks.length === 0) return [{ taskId: '(all)', passed: 'unavailable' }];
	return tasks.map(t => ({ taskId: t.id, passed: t.passed === true ? 'pass' : t.passed === false ? 'fail' : 'unavailable' }));
}

/** The records' view, or null when the Story has no TESTS record. Never throws. */
export function testRecordView(subject: CodeReviewSubject): TestRecordView | null {
	const record = subject.testRecord ?? null;
	if (record === null) return null;
	const notes: string[] = [];
	const runsByFile = new Map<string, Run[]>();
	for (const task of record.body.tasks) {
		const files = (task as { files?: unknown }).files;
		if (!Array.isArray(files)) {
			notes.push(`task ${task.taskId} has no files list; it contributes no file runs`);
			continue;
		}
		const ranAt = typeof task.ranAt === 'string' ? task.ranAt : null;
		const parsed = ranAt === null ? Number.NaN : Date.parse(ranAt);
		const ranAtMs = Number.isFinite(parsed) ? parsed : undefined;
		for (const entry of files as unknown[]) {
			if (!isPlainObject(entry) || typeof entry['file'] !== 'string') {
				notes.push(`task ${task.taskId} has a file entry with no file name; it was dropped`);
				continue;
			}
			const run: Run = { file: entry['file'], taskId: task.taskId, ranAt, ranAtMs, entry };
			const list = runsByFile.get(run.file);
			if (list === undefined) runsByFile.set(run.file, [run]); else list.push(run);
		}
	}
	const files = [...runsByFile.keys()].sort().map(file => {
		const runs = runsByFile.get(file)!;
		const latest = runs.reduce(later);
		return fileView(latest, runs.filter(r => r !== latest));
	});
	return { files, buildTasks: buildTasksOf(subject), notes };
}

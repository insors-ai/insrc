/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's in-process record of each full index that is running
 * (Epic c2ba6fa6, Story s5): when it began, how many files it selected
 * once the walk has counted them, and how many it has finished.
 *
 * The full index opens, updates and closes it; the analyzer's scope check
 * and the search requests read it to say how far a run has got. It is held
 * in memory only and never stored: a daemon restart loses it, and the
 * registry row's lastRun keeps the final figures of the last run.
 *
 * A leaf module: it imports nothing, so a reader does not import the
 * indexer.
 */

/** One running full index, as a reader sees it. */
export interface IndexRunView {
	readonly repoPath:       string;
	/** Unix ms. */
	readonly startedAt:      number;
	/** Absent until the walk has counted the files it will index. */
	readonly filesSelected?: number | undefined;
	readonly filesDone:      number;
}

interface Run {
	repoPath:       string;
	startedAt:      number;
	filesSelected?: number | undefined;
	filesDone:      number;
}

const runs = new Map<string, Run>();

/**
 * With daemon threads (Epic 86197ac6 s2) the full index runs on the
 * code-indexing worker: it publishes its records (onIndexRunsChanged), and the
 * main thread reads them from the status board (setIndexRunSource).
 */
let source: ((repoPath: string) => IndexRunView | undefined) | undefined;
let listener: ((runs: readonly IndexRunView[]) => void) | undefined;
let publishTimer: NodeJS.Timeout | undefined;
/** Changes are published at most this often (a file's bump is frequent). */
const PUBLISH_EVERY_MS = 50;

/** Read every record from `read` instead of this thread's (the main thread: the status board). */
export function setIndexRunSource(read: ((repoPath: string) => IndexRunView | undefined) | undefined): void {
	source = read;
}

/** Be told of this thread's records when they change (the code-indexing worker publishes them). */
export function onIndexRunsChanged(fn: ((runs: readonly IndexRunView[]) => void) | undefined): void {
	listener = fn;
}

function changed(now = false): void {
	if (listener === undefined) return;
	const publish = (): void => { publishTimer = undefined; listener?.([...runs.values()].map(r => ({ ...r }))); };
	if (now) {
		if (publishTimer !== undefined) clearTimeout(publishTimer);
		publish();
		return;
	}
	if (publishTimer !== undefined) return;
	publishTimer = setTimeout(publish, PUBLISH_EVERY_MS);
	publishTimer.unref();
}

/** Open the record of a full index of `repoPath` (replacing any left over). */
export function openIndexRun(repoPath: string, startedAt: number = Date.now()): void {
	runs.set(repoPath, { repoPath, startedAt, filesDone: 0 });
	changed(true);
}

/** The walk has counted the files it will index. */
export function setIndexRunSelected(repoPath: string, filesSelected: number): void {
	const run = runs.get(repoPath);
	if (run !== undefined) run.filesSelected = filesSelected;
	changed(true);
}

/** One more file finished (indexed or skipped). */
export function bumpIndexRunDone(repoPath: string): void {
	const run = runs.get(repoPath);
	if (run !== undefined) run.filesDone += 1;
	changed();
}

/** The running index of `repoPath`, or undefined when none is running. */
export function readIndexRun(repoPath: string): IndexRunView | undefined {
	if (source !== undefined) return source(repoPath);
	const run = runs.get(repoPath);
	return run === undefined ? undefined : { ...run };
}

/** Close the record; returns its last figures. */
export function closeIndexRun(repoPath: string): IndexRunView | undefined {
	const run = runs.get(repoPath);
	runs.delete(repoPath);
	changed(true);
	return run === undefined ? undefined : { ...run };
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Which runs are live in this process.
 *
 * A run is live from before `runAnalyze` first reads a run record until it
 * returns or throws. A reader of a run record uses this to tell a record that
 * is 'in-progress' because its run is going from one whose run died.
 *
 * Liveness is a COUNT of running runs per id, not a set of ids. Nothing
 * refuses a second start under an id whose run is still going, so with a set
 * the run that returns first would remove the id while the other is still
 * running, and a reader would then take a run that is alive for dead.
 */

import { assertSessionReuseNow, sessionReuseWindow } from '../session-reuse.js';
import type { ConnectionExecutionContext } from '../../shared/step-context.js';

const liveCount = new Map<string, number>();

/**
 * Told when a run id starts or stops being live on this thread (Story 5d393a4b): with daemon
 * threads, the status board then knows the owner, and analyze.run.status / analyze.run.purge
 * for that id are sent to it, where this count is true.
 */
let publisher: ((runId: string, live: boolean) => void) | undefined;
export function setLiveRunPublisher(fn: ((runId: string, live: boolean) => void) | undefined): void {
	publisher = fn;
}
const up = (runId: string): void => {
	const count = liveCount.get(runId) ?? 0;
	liveCount.set(runId, count + 1);
	if (count === 0) publisher?.(runId, true);
};
const down = (runId: string): void => {
	const count = liveCount.get(runId) ?? 0;
	if (count <= 1) { liveCount.delete(runId); if (count === 1) publisher?.(runId, false); }
	else liveCount.set(runId, count - 1);
};

/** One more run is going under this id. */
export function raiseRunLive(runId: string): void {
	assertSessionReuseNow(undefined);
	up(runId);
}

/** One run under this id has returned or thrown. */
export function lowerRunLive(runId: string): void {
	assertSessionReuseNow(undefined);
	down(runId);
}

/** How many runs are going under this id in this process. */
export function liveRunCount(runId: string, execution?: ConnectionExecutionContext): number {
	assertSessionReuseNow(execution);
	if (execution?.mode === 'session-memory') return ownerLiveCounts.get(sessionReuseWindow(execution).owner)?.get(runId) ?? 0;
	return liveCount.get(runId) ?? 0;
}

/** Whether at least one run is going under this id in this process. */
export function isRunLive(runId: string, execution?: ConnectionExecutionContext): boolean {
	return liveRunCount(runId, execution) > 0;
}


// Session counts contain keys only and are separate from Saved run ids.
const ownerLiveCounts = new Map<string, Map<string, number>>();
/** Capture the cleanup key while admitted; cleanup still works after expiry. */
export function trackRunLive(runId: string, execution?: ConnectionExecutionContext): () => void {
	assertSessionReuseNow(execution);
	if (execution?.mode !== 'session-memory') {
		up(runId);
		let released = false;
		return () => { if (released) return; released = true; down(runId); };
	}
	const owner = sessionReuseWindow(execution).owner;
	let counts = ownerLiveCounts.get(owner);
	if (!counts) { counts = new Map(); ownerLiveCounts.set(owner, counts); }
	counts.set(runId, (counts.get(runId) ?? 0) + 1);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		const count = counts!.get(runId) ?? 0;
		if (count <= 1) counts!.delete(runId); else counts!.set(runId, count - 1);
		if (counts!.size === 0) ownerLiveCounts.delete(owner);
	};
}

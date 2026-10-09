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

const liveCount = new Map<string, number>();

/** One more run is going under this id. */
export function raiseRunLive(runId: string): void {
	liveCount.set(runId, (liveCount.get(runId) ?? 0) + 1);
}

/** One run under this id has returned or thrown. */
export function lowerRunLive(runId: string): void {
	const count = liveCount.get(runId) ?? 0;
	if (count <= 1) liveCount.delete(runId);
	else liveCount.set(runId, count - 1);
}

/** Whether at least one run is going under this id in this process. */
export function isRunLive(runId: string): boolean {
	return (liveCount.get(runId) ?? 0) > 0;
}

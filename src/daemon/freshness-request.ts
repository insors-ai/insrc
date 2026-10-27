/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The request step of codeReview.freshness: queue one index job for each file the compute lists as
 * unindexed, remember when, and re-read the queue so the same reply shows the work. A file is not
 * requested again until its mtime moves past the recorded time (the compute reads the map through
 * `requestedAt`), so a poll loop cannot pile up jobs.
 */

import { isAbsolute, join } from 'node:path';

import type { FreshnessResult } from '../workflow/code-review/freshness.js';

/** The queue operations the request step uses. */
export interface FreshnessQueue {
	enqueue(job: { kind: 'file'; filePath: string; event: 'update' }): void;
	codeIndexWorkFor(repoPath: string): { inFlight: boolean; pending: number } | Promise<{ inFlight: boolean; pending: number }>;
}

/** Unix ms of the last index request, by absolute file path. Lives as long as the daemon process. */
export type FreshnessRequests = Map<string, number>;

const absolute = (repoPath: string, file: string): string => (isAbsolute(file) ? file : join(repoPath, file));

/** The recorded request time for a changed file, or undefined. */
export function requestedAtFor(requests: FreshnessRequests, repoPath: string, file: string): number | undefined {
	return requests.get(absolute(repoPath, file));
}

/** Queue the unindexed files and return the result with the queue state re-read afterwards. */
export async function requestUnindexedFiles(
	queue: FreshnessQueue,
	requests: FreshnessRequests,
	repoPath: string,
	result: FreshnessResult,
	now: () => number = Date.now,
): Promise<FreshnessResult> {
	if (result.unindexedFiles.length === 0) return result;
	for (const file of result.unindexedFiles) {
		const filePath = absolute(repoPath, file);
		queue.enqueue({ kind: 'file', filePath, event: 'update' });
		requests.set(filePath, now());
	}
	const work = await queue.codeIndexWorkFor(repoPath);
	return { ...result, isProcessing: work.inFlight || work.pending > 0, inFlight: work.inFlight, pendingCodeIndexJobs: work.pending };
}

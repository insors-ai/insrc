/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The review report of a stored artifact for the readers that work from its json path and cannot wait for the history (the
 * tracker push, the CLI's resolve command): the lifecycle review names the report entry, and the entry and the resolutions after
 * it are read from the artifact's log file. `readReviewReport` is the same read through the History.
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

import { lifecycleReviewOf } from '../artifact-core/approval-view.js';
import { FileSidecarStore } from '../artifact-core/sidecar-store.js';
import type { Actor, ChangeLogEntry, Review } from '../artifact-core/types.js';
import type { ReviewResolution } from '../types.js';
import { resolutionEntryOf, reviewRecordOf } from './report-log.js';
import type { ReviewRecord } from './report-log.js';

/** The repository root and the artifact id of a head at `<repo>/.insrc/artifacts/<id>.json`. */
export function locateHead(jsonPath: string): { readonly repo: string; readonly artifactId: string } {
	return { repo: resolve(dirname(jsonPath), '..', '..'), artifactId: basename(jsonPath).replace(/\.json$/, '') };
}

/** The report of the artifact's lifecycle review and the resolutions recorded since, or undefined when there is no review, no report entry or the log cannot be read. */
export function readReviewRecordOf(jsonPath: string): ReviewRecord | undefined {
	try {
		const { repo, artifactId } = locateHead(jsonPath);
		const meta = (JSON.parse(readFileSync(jsonPath, 'utf8')) as { meta?: unknown }).meta;
		const review = lifecycleReviewOf(meta);
		if (review === undefined) return undefined;
		const log = new FileSidecarStore(repo).readRecordsSync<ChangeLogEntry>('log', artifactId);
		return reviewRecordOf(log, artifactId, { report: review['report'] as Review['report'] });
	} catch { return undefined; }
}

/** Record the resolution of one finding as a 'review' entry of the artifact's log, after the report entry it resolves. */
export function appendResolutionOf(jsonPath: string, actor: Actor, resolution: ReviewResolution, timestamp: string): void {
	const { repo, artifactId } = locateHead(jsonPath);
	const entry = resolutionEntryOf({ id: `resolution-${resolution.findingId}-${randomUUID()}`, actor, timestamp, findingId: resolution.findingId, resolution });
	new FileSidecarStore(repo).appendRecordSync('log', { artifactId, entry });
}

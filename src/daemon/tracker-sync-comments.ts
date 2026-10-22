/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's side of the comment sync (s8): the `tracker.syncComments` method, and the best-effort run a build turn makes for
 * its Task. The method answers why nothing was attempted; the runner never throws and never fails the turn that calls it.
 */

import { getLogger } from '../shared/logger.js';
import { createFileSidecarStore } from '../workflow/artifact-core/sidecar-store.js';
import { History } from '../workflow/artifact-core/history.js';
import { openTracker } from '../workflow/tracker-auto.js';
import { syncUnitComments } from '../workflow/tracker/comment-sync.js';
import type { CommentSyncResult } from '../workflow/tracker/comment-sync.js';
import type { UnitRef } from '../workflow/tracker/refs.js';
import { lifecycleFor } from './lifecycle-registry.js';
import { repoSchemaRefusal } from './repo-schema-guard.js';

const log = getLogger('daemon:tracker-sync-comments');

export interface TrackerSyncCommentsParams {
	readonly repo?: string;
	readonly epicHash?: string;
	readonly unit?: 'epic' | 'story' | 'task';
	readonly storyId?: string;
	readonly taskId?: string;
}

/** `tracker.syncComments`: sync the unit's issue comments; `{ error }` when nothing could be attempted. */
export async function handleTrackerSyncComments(params: unknown, repoEnv: string | undefined): Promise<CommentSyncResult | { error: string }> {
	const p = (params ?? {}) as TrackerSyncCommentsParams;
	const repoPath = p.repo !== undefined && p.repo.length > 0 ? p.repo : repoEnv;
	if (repoPath === undefined || repoPath.length === 0) return { error: 'repo is required (or set INSRC_REPO)' };
	const refusal = repoSchemaRefusal(repoPath);
	if (refusal !== undefined) return { error: refusal };
	if (typeof p.epicHash !== 'string' || p.epicHash.length === 0) return { error: 'epicHash is required' };
	if (p.unit !== undefined && p.unit !== 'epic' && p.unit !== 'story' && p.unit !== 'task') return { error: 'unit must be epic, story or task' };
	const unit = p.unit ?? (p.taskId !== undefined ? 'task' : p.storyId !== undefined ? 'story' : 'epic');
	if (unit !== 'epic' && (typeof p.storyId !== 'string' || p.storyId.length === 0)) return { error: `storyId is required for a ${unit} unit` };
	if (unit === 'task' && (typeof p.taskId !== 'string' || p.taskId.length === 0)) return { error: 'taskId is required for a task unit' };
	const gate = openTracker(repoPath);
	if ('skip' in gate) return { error: `no GitHub tracker to sync with: ${gate.skip.status === 'skipped' || gate.skip.status === 'failed' ? gate.skip.reason : gate.skip.status}` };
	const ref: UnitRef = {
		unit, repoPath, epicHash: p.epicHash,
		...(p.storyId !== undefined ? { storyId: p.storyId } : {}),
		...(p.taskId !== undefined ? { taskId: p.taskId } : {}),
	};
	const entry = lifecycleFor(repoPath);
	return syncUnitComments(ref, gate.port, { feedback: entry.feedback, history: new History(createFileSidecarStore(repoPath)), store: entry.store });
}

/** One line for a build turn's answer: what the sync recorded and posted, or why it did nothing. */
function summarise(r: CommentSyncResult | { error: string }): string | undefined {
	if ('error' in r) return undefined;
	if (r.note !== undefined) return undefined;
	const failed = r.failed.length > 0 ? `, ${r.failed.length} failed (${r.failed.map(f => f.reason).join('; ')})` : '';
	return `comment sync on ${r.issue ?? 'the issue'}: recorded ${r.recorded.length}, posted ${r.posted.length}${failed}`;
}

/** Best-effort sync for a Task, for implement and validate: never throws; a repository with no tracker, or a Task with no issue, says nothing. */
export async function runTaskCommentSync(repoPath: string, epicHash: string, storyId: string, taskId: string): Promise<string | undefined> {
	try {
		return summarise(await handleTrackerSyncComments({ repo: repoPath, epicHash, unit: 'task', storyId, taskId }, undefined));
	} catch (err) {
		log.warn({ err: (err as Error).message, storyId, taskId }, 'comment sync for the task failed');
		return undefined;
	}
}

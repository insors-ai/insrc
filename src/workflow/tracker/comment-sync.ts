/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The comment sync (s8): what people wrote on a unit's issue becomes feedback on the unit's artifact, each comment once, with the
 * tracker user as its author. Nothing runs in the background: the build step's implement and validate phases and the daemon method
 * call it where the holder works on the unit. It never throws; every step that fails is in the result and the call can be repeated.
 *
 * Inbound: the issue's comments are read in full (a comment recorded already is skipped by its id, so a repeated read costs
 * nothing and a transient failure loses nothing), the framework's own comments are dropped, and each human comment is
 * recorded under the entry id `tracker:<comment id>`. A comment edited or deleted on the tracker after it was recorded is not mirrored.
 */

import { taskHeadIdOf } from '../tasks/lookup.js';
import type { FeedbackService } from '../feedback/feedback-service.js';
import type { History } from '../artifact-core/history.js';
import { getLogger } from '../../shared/logger.js';
import { unitArtifactId } from './attach.js';
import { readBinding } from './binding.js';
import { actorOfLogin, classifyComment, feedbackIdOfComment, isFrameworkComment } from './comment-rules.js';
import type { TrackerPort } from './port.js';
import type { UnitRef } from './refs.js';

const log = getLogger('workflow:comment-sync');

export interface CommentSyncDeps {
	/** Records the comments as feedback, on the same history and store as every other writer. */
	readonly feedback: FeedbackService;
	readonly history:  History;
}

/** What one sync did. Nothing in it is an exception: a step that failed is in `failed` and is retried by the next call. */
export interface CommentSyncResult {
	/** Why nothing was attempted (no artifact, no binding), when that is so. */
	readonly note?:        string | undefined;
	readonly artifactId?:  string | undefined;
	readonly issue?:       string | undefined;
	/** Tracker comment ids recorded as feedback by this call. */
	readonly recorded:     string[];
	/** Comments the framework posted, never recorded. */
	readonly framework:    string[];
	/** Comments recorded by an earlier call (or edited since): skipped. */
	readonly known:        string[];
	/** Feedback ids posted to the issue by this call. */
	readonly posted:       string[];
	/** Feedback ids found already on the issue by their marker and recorded without a second post. */
	readonly reconciled:   string[];
	readonly failed:       { readonly step: string; readonly id?: string | undefined; readonly reason: string }[];
}

const empty = (): CommentSyncResult => ({ recorded: [], framework: [], known: [], posted: [], reconciled: [], failed: [] });

/** The artifact that holds the unit's feedback and binding: the Task's own artifact, the Story's LLD, the Epic's Define. */
export function artifactOfUnit(unit: UnitRef): string | undefined {
	if (unit.unit === 'task') return unit.storyId !== undefined && unit.taskId !== undefined ? taskHeadIdOf(unit.repoPath, unit.epicHash, unit.storyId, unit.taskId) : undefined;
	return unitArtifactId(unit);
}

/** The issue and artifact a unit's comments are synced with, or why there are none. */
function locate(unit: UnitRef): { artifactId: string; issue: string } | string {
	const artifactId = artifactOfUnit(unit);
	if (artifactId === undefined) return `the ${unit.unit} has no artifact to hold feedback yet`;
	let issue: string | undefined;
	try { issue = readBinding(unit.repoPath, artifactId)?.reference.entityId; }
	catch (err) { return `the binding of ${artifactId} cannot be read: ${(err as Error).message}`; }
	return issue === undefined ? `${artifactId} is not bound to an issue` : { artifactId, issue };
}

/** Read the unit's issue comments into feedback (inbound), then post local feedback once (outbound, added with the outbound half). */
export async function syncUnitComments(unit: UnitRef, port: TrackerPort, deps: CommentSyncDeps): Promise<CommentSyncResult> {
	const out = empty();
	try {
		const where = locate(unit);
		if (typeof where === 'string') return { ...out, note: where };
		const result: CommentSyncResult = { ...out, artifactId: where.artifactId, issue: where.issue };
		await readInbound(where.artifactId, where.issue, port, deps, result);
		return result;
	} catch (err) {
		log.warn({ err: (err as Error).message }, 'comment-sync: the sync failed');
		return { ...out, failed: [{ step: 'sync', reason: (err as Error).message }] };
	}
}

async function readInbound(artifactId: string, issue: string, port: TrackerPort, deps: CommentSyncDeps, out: CommentSyncResult): Promise<void> {
	const listed = port.listComments(issue);
	if (!listed.ok) { out.failed.push({ step: 'read', reason: listed.reason }); return; }
	const known = new Set((await deps.history.feedback(artifactId)).map(f => f.id));
	for (const c of listed.value) {
		if (isFrameworkComment(c.text)) { out.framework.push(c.externalId); continue; }
		const id = feedbackIdOfComment(c.externalId);
		if (known.has(id)) { out.known.push(c.externalId); continue; }
		try {
			await deps.feedback.add(artifactId, {
				id, text: c.text, kind: classifyComment(c.text),
				source: { system: 'github', externalId: c.externalId, ...(c.url !== undefined ? { url: c.url } : {}) },
			}, actorOfLogin(c.author));
			out.recorded.push(c.externalId);
		} catch (err) {
			out.failed.push({ step: 'record', id: c.externalId, reason: err instanceof Error ? err.message : String(err) });
		}
	}
}

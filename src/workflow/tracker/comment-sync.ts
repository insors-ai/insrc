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
 *
 * Outbound: a feedback entry that came from a person here (it has no source) and has no receipt is posted once. The issue's comments
 * are read first and one carrying the entry's marker is recorded as posted without posting again (a post whose receipt was lost);
 * when the comments cannot be read nothing is posted, because an uncertain post is never retried blind. A post is recorded by a
 * revision-less receipt entry on the artifact's log (outcome `posted`, data kind `feedback-post`), which moves no revision.
 */

import { orderedEntryId } from '../tasks/task-set.js';
import { taskHeadIdOf } from '../tasks/lookup.js';
import type { FeedbackService } from '../feedback/feedback-service.js';
import type { History } from '../artifact-core/history.js';
import type { ArtifactStore } from '../artifact-core/store.js';
import type { Actor, Feedback } from '../artifact-core/types.js';
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
	/** Serialises a receipt append with the artifact's other writers. */
	readonly store:    ArtifactStore;
}

/** Who a receipt is recorded as: the sync itself. */
const SYNC_ACTOR: Actor = { id: 'insrc:comment-sync', kind: 'system', properties: {} };

/** The marker a feedback entry's comment carries, first line: the comment is told from a person's by it, and a lost receipt is found by it. */
export function feedbackMarker(artifactId: string, feedbackId: string): string {
	return `<!-- insrc:feedback:${artifactId}:${feedbackId} -->`;
}

/** The comment text posted for a feedback entry. */
function feedbackBody(artifactId: string, f: Feedback): string {
	const who = f.actor.name ?? f.actor.id;
	const head = `**Feedback from ${who}** (${f.kind}${f.inReplyTo !== undefined ? `, in reply to ${f.inReplyTo}` : ''})`;
	return `${feedbackMarker(artifactId, f.id)}\n${head}\n\n${f.text}`;
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

/** Read the unit's issue comments into feedback (inbound), then post feedback entered here once (outbound). */
export async function syncUnitComments(unit: UnitRef, port: TrackerPort, deps: CommentSyncDeps): Promise<CommentSyncResult> {
	const out = empty();
	try {
		const where = locate(unit);
		if (typeof where === 'string') return { ...out, note: where };
		const result: CommentSyncResult = { ...out, artifactId: where.artifactId, issue: where.issue };
		await readInbound(where.artifactId, where.issue, port, deps, result);
		await postOutbound(where.artifactId, where.issue, port, deps, result);
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

/** The feedback ids that already have a receipt on the artifact's log. */
async function receiptsOf(artifactId: string, deps: CommentSyncDeps): Promise<Set<string>> {
	const out = new Set<string>();
	for (const e of await deps.history.log(artifactId)) {
		const data = e.outcome?.data as { kind?: unknown; feedbackId?: unknown } | undefined;
		if (data?.kind === 'feedback-post' && typeof data.feedbackId === 'string') out.add(data.feedbackId);
	}
	return out;
}

async function writeReceipt(artifactId: string, issue: string, feedbackId: string, externalId: string, deps: CommentSyncDeps): Promise<void> {
	await deps.store.exclusive(artifactId, () => deps.history.appendLog(artifactId, {
		id: orderedEntryId(), actor: SYNC_ACTOR, timestamp: new Date().toISOString(), operation: 'update',
		outcome: { result: 'posted', summary: `feedback ${feedbackId} posted to ${issue}`, data: { kind: 'feedback-post', feedbackId, externalId, issue } },
	}));
}

async function postOutbound(artifactId: string, issue: string, port: TrackerPort, deps: CommentSyncDeps, out: CommentSyncResult): Promise<void> {
	const receipts = await receiptsOf(artifactId, deps);
	// entries that came from the tracker are never posted back
	const pending = (await deps.history.feedback(artifactId)).filter(f => f.source === undefined && !receipts.has(f.id));
	if (pending.length === 0) return;
	const listed = port.listComments(issue);
	if (!listed.ok) { out.failed.push({ step: 'reconcile', reason: listed.reason }); return; }
	for (const f of pending) {
		try {
			const marker = feedbackMarker(artifactId, f.id);
			const found = listed.value.find(c => c.text.includes(marker));
			if (found !== undefined) {
				await writeReceipt(artifactId, issue, f.id, found.externalId, deps);
				out.reconciled.push(f.id);
				continue;
			}
			const posted = port.postComment(issue, feedbackBody(artifactId, f));
			if (!posted.ok) { out.failed.push({ step: 'post', id: f.id, reason: posted.reason }); continue; }
			try { await writeReceipt(artifactId, issue, f.id, posted.value.externalId, deps); }
			catch (err) { out.failed.push({ step: 'receipt', id: f.id, reason: `posted as ${posted.value.externalId} but the receipt was not written: ${err instanceof Error ? err.message : String(err)}` }); continue; }
			out.posted.push(f.id);
		} catch (err) {
			out.failed.push({ step: 'post', id: f.id, reason: err instanceof Error ? err.message : String(err) });
		}
	}
}

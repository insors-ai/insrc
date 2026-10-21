/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The tracker binding of a lifecycle artifact (sc6, s6): the one writer of `meta.envelope.binding` after the artifact is
 * created. The unit's issue, what was posted to it and a link under the parent that failed all live in the typed binding.
 *
 * Every write is a synchronous meta-only patch of the head, because the team gate and the draft-issue hook that record a
 * unit's issue are synchronous and the artifact store is not. A patch moves neither the revision number nor the content hash,
 * appends no change log entry (tracker bookkeeping is recorded in the binding itself) and is refused while the store has a
 * write staged for the artifact, so it can never change a head the store staged against. A content write by the store keeps the
 * binding on disk (`carryBinding`).
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getLogger } from '../../shared/logger.js';
import { isAttachment, isBinding } from '../artifact-core/decode.js';
import { JOURNAL_DIR } from '../artifact-core/journal.js';
import { ArtifactShapeError } from '../artifact-core/types.js';
import type { Attachment, TrackerBinding } from '../artifact-core/types.js';
import { artifactJsonPath, writeArtifact } from '../storage.js';
import type { IssueRef } from './port.js';

const log = getLogger('workflow:tracker-binding');

/** The type of the reference a binding holds: the namespaced external type docs/plans/core-data-model.md names for an issue. */
export const TRACKER_ISSUE_TYPE = 'github:issue';

export type PostedKind = TrackerBinding['posted'][number]['kind'];

/** Why a patch was not made: another issue is bound, the head cannot be read, a store write is staged, or the write failed. */
export type BindFailureKind = 'conflict' | 'unreadable' | 'staged' | 'write';

export type BindResult =
	| { readonly ok: true; readonly binding: TrackerBinding; readonly created: boolean }
	| { readonly ok: false; readonly kind: BindFailureKind; readonly reason: string };

type Head = { meta: Record<string, unknown> } & Record<string, unknown>;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** True while the store has a write staged for the artifact (its journal file exists). */
export function hasStagedWrite(repoPath: string, artifactId: string): boolean {
	return existsSync(join(repoPath, JOURNAL_DIR, `${artifactId}.json`));
}

/** The head of the artifact, or undefined when there is no file. A file that is not a head throws ArtifactShapeError. */
function readHead(repoPath: string, artifactId: string): { readonly path: string; readonly head: Head } | undefined {
	const path = artifactJsonPath(repoPath, artifactId);
	if (!existsSync(path)) return undefined;
	let parsed: unknown;
	try { parsed = JSON.parse(readFileSync(path, 'utf8')); }
	catch (err) { throw new ArtifactShapeError(`the head of ${artifactId} is not valid JSON (${(err as Error).message})`); }
	if (!isObject(parsed) || !isObject(parsed['meta']) || !isObject(parsed['body'])) throw new ArtifactShapeError(`the head of ${artifactId} has no meta and body objects`);
	return { path, head: parsed as Head };
}

function bindingOf(artifactId: string, head: Head): TrackerBinding | undefined {
	const envelope = head.meta['envelope'];
	if (envelope === undefined) return undefined;
	if (!isObject(envelope)) throw new ArtifactShapeError(`meta.envelope of ${artifactId} is not an object`);
	const binding = envelope['binding'];
	if (binding === undefined) return undefined;
	if (!isBinding(binding)) throw new ArtifactShapeError(`meta.envelope of ${artifactId} has a malformed binding`);
	return binding as unknown as TrackerBinding;
}

/** The head's revision number: the lifecycle's when it has one, else meta.revision, else 0. */
function revisionOf(head: Head): number {
	const lifecycle = head.meta['lifecycle'];
	const fromLifecycle = isObject(lifecycle) && isObject(lifecycle['revision']) ? lifecycle['revision']['number'] : undefined;
	if (typeof fromLifecycle === 'number' && Number.isInteger(fromLifecycle)) return fromLifecycle;
	const r = head.meta['revision'];
	return typeof r === 'number' && Number.isInteger(r) && r >= 0 ? r : 0;
}

/**
 * The artifact's binding, or undefined when it has none or the artifact does not exist. Synchronous and read-only.
 * Throws ArtifactShapeError when the head is not a head or its binding is malformed.
 */
export function readBinding(repoPath: string, artifactId: string): TrackerBinding | undefined {
	const read = readHead(repoPath, artifactId);
	return read === undefined ? undefined : bindingOf(artifactId, read.head);
}

/** Patch the binding of an existing, bound-or-not artifact with `change`; `change` returns the next binding or undefined for no change. */
function patchBinding(
	repoPath: string, artifactId: string,
	change: (current: TrackerBinding | undefined, head: Head) => { readonly next: TrackerBinding; readonly created: boolean } | { readonly fail: BindResult & { readonly ok: false } },
): BindResult {
	if (hasStagedWrite(repoPath, artifactId)) {
		return { ok: false, kind: 'staged', reason: `a store write is staged for ${artifactId}; the binding is recorded by the next call` };
	}
	let read: ReturnType<typeof readHead>;
	let current: TrackerBinding | undefined;
	try {
		read = readHead(repoPath, artifactId);
		if (read === undefined) return { ok: false, kind: 'unreadable', reason: `${artifactId} has no head to bind` };
		current = bindingOf(artifactId, read.head);
	} catch (err) { return { ok: false, kind: 'unreadable', reason: (err as Error).message }; }
	const changed = change(current, read.head);
	if ('fail' in changed) return changed.fail;
	if (changed.next === current) return { ok: true, binding: changed.next, created: false };
	try {
		const envelope = isObject(read.head.meta['envelope']) ? read.head.meta['envelope'] : {};
		writeArtifact(read.path, { ...read.head, meta: { ...read.head.meta, envelope: { ...envelope, binding: changed.next } } }, 'meta-only');
		return { ok: true, binding: changed.next, created: changed.created };
	} catch (err) {
		return { ok: false, kind: 'write', reason: `the binding of ${artifactId} could not be written: ${(err as Error).message}` };
	}
}

/**
 * Bind the artifact to its one issue: { reference, createdAtRevision, posted: [] }. Idempotent for the same issue; refuses a
 * different one (a unit has exactly one issue). The revision number and content hash do not move.
 */
export function bindArtifact(repoPath: string, artifactId: string, issue: IssueRef, now: () => string = () => new Date().toISOString()): BindResult {
	void now;   // a binding carries the revision it was created at, not a time
	return patchBinding(repoPath, artifactId, (current, head) => {
		if (current !== undefined) {
			if (current.reference.entityId === issue) return { next: current, created: false };
			return { fail: { ok: false, kind: 'conflict', reason: `${artifactId} is bound to ${current.reference.entityId}; it cannot also be bound to ${issue} (a unit has exactly one issue)` } };
		}
		return { next: { reference: { entityId: issue, type: TRACKER_ISSUE_TYPE, relation: 'tracked-by' }, createdAtRevision: revisionOf(head), posted: [] }, created: true };
	});
}

/** Record that `kind` was posted to the unit's issue (once; a kind already recorded stays as it was). False when it could not be recorded. */
export function recordPosted(repoPath: string, artifactId: string, kind: PostedKind, externalId?: string, now: () => string = () => new Date().toISOString()): boolean {
	const result = patchBinding(repoPath, artifactId, current => {
		if (current === undefined) return { fail: { ok: false, kind: 'unreadable', reason: `${artifactId} has no binding to record a post on` } };
		if (current.posted.some(p => p.kind === kind)) return { next: current, created: false };
		return { next: { ...current, posted: [...current.posted, { kind, at: now(), ...(externalId !== undefined ? { externalId } : {}) }] }, created: false };
	});
	if (!result.ok) log.warn({ artifactId, kind, why: result.kind, reason: result.reason }, 'binding: the post was not recorded');
	return result.ok;
}

/** Keep the link under the parent that failed (it needs a child ref or a child id), or clear it with undefined. False when not written. */
export function setPendingLink(repoPath: string, artifactId: string, link: TrackerBinding['pendingLink']): boolean {
	if (link !== undefined && link.child === undefined && link.childId === undefined) {
		log.warn({ artifactId }, 'binding: a pending link has to name a child ref or a child id');
		return false;
	}
	const result = patchBinding(repoPath, artifactId, current => {
		if (current === undefined) return { fail: { ok: false, kind: 'unreadable', reason: `${artifactId} has no binding to keep a pending link on` } };
		const { pendingLink: _old, ...rest } = current;
		const next: TrackerBinding = link === undefined ? rest : { ...rest, pendingLink: link };
		return JSON.stringify(next) === JSON.stringify(current) ? { next: current, created: false } : { next, created: false };
	});
	if (!result.ok) log.warn({ artifactId, why: result.kind, reason: result.reason }, 'binding: the pending link was not written');
	return result.ok;
}

/** The attachments recorded on the artifact's head, in the order they were made; empty for an artifact with none or no head. Throws ArtifactShapeError for a malformed head or attachment list. */
export function readAttachments(repoPath: string, artifactId: string): readonly Attachment[] {
	const read = readHead(repoPath, artifactId);
	if (read === undefined) return [];
	const envelope = read.head.meta['envelope'];
	if (envelope === undefined) return [];
	if (!isObject(envelope)) throw new ArtifactShapeError(`meta.envelope of ${artifactId} is not an object`);
	const list = envelope['attachments'];
	if (list === undefined) return [];
	if (!Array.isArray(list) || !list.every(isAttachment)) throw new ArtifactShapeError(`meta.envelope of ${artifactId} has a malformed attachment`);
	return list as unknown as Attachment[];
}

/**
 * Record one Attachment on the head of the unit's own artifact (the one that holds the binding): { target, revision, at, externalId }.
 * Appends; an identical (target, fragment, revision) already recorded is left as it is. Refused while the store has a write staged.
 * False when it could not be recorded.
 */
export function recordAttachment(repoPath: string, artifactId: string, attachment: Attachment): boolean {
	const fail = (why: BindFailureKind, reason: string): false => { log.warn({ artifactId, why, reason }, 'binding: the attachment was not recorded'); return false; };
	if (hasStagedWrite(repoPath, artifactId)) return fail('staged', `a store write is staged for ${artifactId}; the attachment is recorded by the next call`);
	try {
		const read = readHead(repoPath, artifactId);
		if (read === undefined) return fail('unreadable', `${artifactId} has no head to record an attachment on`);
		const current = [...readAttachments(repoPath, artifactId)];
		const same = (a: Attachment): boolean => a.target.entityId === attachment.target.entityId && a.target.fragment === attachment.target.fragment && a.revision === attachment.revision;
		if (current.some(same)) return true;
		const envelope = isObject(read.head.meta['envelope']) ? read.head.meta['envelope'] : {};
		writeArtifact(read.path, { ...read.head, meta: { ...read.head.meta, envelope: { ...envelope, attachments: [...current, attachment] } } }, 'meta-only');
		return true;
	} catch (err) { return fail('write', (err as Error).message); }
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The one decoder (sc2): a pure, synchronous function from an artifact id and
 * the text of its head to the envelope. `ArtifactStore.read` wraps it and the
 * four gates readers call it, so a head is read one way everywhere. A head with
 * no `meta.envelope` or `meta.lifecycle` (every head stored before the s9
 * conversion) decodes with empty parts.
 */

import { InvalidArtifactKeyError } from '../artifact-ids.js';
import { codecFor, keyOf } from './codecs.js';
import type { HeadFile, HeadPayload } from './codecs.js';
import { ArtifactShapeError } from './types.js';
import type { Actor, Artifact, Attachment, Lifecycle, Reference, Status, TrackerBinding } from './types.js';

const STATUSES: readonly Status[] = [
	'draft', 'pending-review', 'approved', 'in-signoff', 'changes-requested', 'signed-off', 'rejected', 'completed', 'withdrawn', 'superseded',
];

/** The actor recorded on parts the model fills in itself. */
export const SYSTEM_ACTOR: Actor = { id: 'insrc:system', kind: 'system', properties: {} };

export interface DecodedHead {
	readonly artifact: Artifact<HeadPayload>;
	/** The parsed head, for callers that keep reading raw fields. */
	readonly head:     HeadFile;
}

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A draft lifecycle at the head's own revision (0 when it has none). */
export function emptyLifecycle(revision: number): Lifecycle {
	return { status: 'draft', revision: { number: revision, contentHash: '', at: '', by: SYSTEM_ACTOR }, signoffs: [] };
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isActor = (v: unknown): boolean => isObject(v) && isStr(v['id']) && isStr(v['kind']) && isObject(v['properties']);
const isReference = (v: unknown): boolean => isObject(v) && isStr(v['entityId']) && isStr(v['type']) && isStr(v['relation']);
const isInt = (v: unknown): boolean => typeof v === 'number' && Number.isInteger(v);
const isSignoff = (v: unknown): boolean => isObject(v) && isInt(v['revision']) && isReference(v['request'])
	&& (v['state'] === 'open' || v['state'] === 'changes-requested' || v['state'] === 'completed')
	&& Array.isArray(v['actors']) && v['actors'].every(isActor) && isStr(v['at']);
const isAttachment = (v: unknown): boolean => isObject(v) && isReference(v['target']) && isInt(v['revision']) && isStr(v['at']);
const isBinding = (v: unknown): boolean => isObject(v) && isReference(v['reference']) && isInt(v['createdAtRevision'])
	&& Array.isArray(v['posted']) && v['posted'].every(p => isObject(p) && isStr(p['kind']) && isStr(p['at']));

/** The reason a lifecycle part is malformed, or undefined when it is well formed. */
function lifecycleProblem(v: unknown): string | undefined {
	if (!isObject(v)) return 'is not an object';
	if (!(STATUSES as readonly unknown[]).includes(v['status'])) return `has an unknown status '${String(v['status'])}'`;
	const r = v['revision'];
	if (!isObject(r) || !Number.isInteger(r['number']) || !isStr(r['contentHash']) || !isStr(r['at']) || !isActor(r['by'])) return 'has a malformed revision';
	if (!Array.isArray(v['signoffs']) || !v['signoffs'].every(isSignoff)) return 'has no signoffs list, or a malformed signoff';
	const approval = v['approval'];
	if (approval !== undefined && !(isObject(approval) && isInt(approval['revision']) && isActor(approval['by']) && isStr(approval['at'])
		&& (approval['override'] === undefined || (isObject(approval['override']) && isStr(approval['override']['reason']))))) return 'has a malformed approval';
	const review = v['review'];
	if (review !== undefined && !(isObject(review) && isInt(review['revision']) && isActor(review['reviewer'])
		&& (review['party'] === 'controller' || review['party'] === 'daemon')
		&& (review['verdict'] === 'pass' || review['verdict'] === 'warn' || review['verdict'] === 'block')
		&& isObject(review['counts']) && isStr(review['at'])
		&& (review['report'] === undefined || isReference(review['report'])))) return 'has a malformed review';
	const stale = v['stale'];
	if (stale !== undefined && !(isObject(stale) && isReference(stale['upstream']) && isInt(stale['upstreamRevision']) && isStr(stale['since']))) return 'has a malformed staleness record';
	return undefined;
}

export function decodeArtifactHead(id: string, raw: string): DecodedHead {
	const key = keyOf(id);
	if (key === undefined) throw new InvalidArtifactKeyError(`'${id}' is not an artifact id`);
	const codec = codecFor(key.kind);

	let parsed: unknown;
	try { parsed = JSON.parse(raw); }
	catch (err) { throw new ArtifactShapeError(`the head of ${id} is not valid JSON (${(err as Error).message})`); }
	if (!isObject(parsed) || !isObject(parsed['meta']) || !isObject(parsed['body'])) {
		throw new ArtifactShapeError(
			`the head of ${id} has no meta and body objects` +
			(key.kind === 'AMD' ? '; a flat amendment has to be converted first by the s9 conversion' : ''),
		);
	}
	if (parsed['citations'] !== undefined && !Array.isArray(parsed['citations'])) {
		throw new ArtifactShapeError(`the citations of ${id} are not a list`);
	}
	const head = parsed as unknown as HeadFile;
	const meta = head.meta;

	const envelope = meta['envelope'];
	if (envelope !== undefined && !isObject(envelope)) throw new ArtifactShapeError(`meta.envelope of ${id} is not an object`);
	const lifecycle = meta['lifecycle'];
	if (lifecycle !== undefined) {
		const problem = lifecycleProblem(lifecycle);
		if (problem !== undefined) throw new ArtifactShapeError(`meta.lifecycle of ${id} ${problem}`);
	}
	const references = envelope?.['references'];
	const attachments = envelope?.['attachments'];
	if ((references !== undefined && !Array.isArray(references)) || (attachments !== undefined && !Array.isArray(attachments))) {
		throw new ArtifactShapeError(`meta.envelope of ${id} has references or attachments that are not lists`);
	}
	if (Array.isArray(references) && !references.every(isReference)) throw new ArtifactShapeError(`meta.envelope of ${id} has a reference without an entityId, type and relation`);
	if (Array.isArray(attachments) && !attachments.every(isAttachment)) throw new ArtifactShapeError(`meta.envelope of ${id} has a malformed attachment`);
	const parentRef = envelope?.['parent'];
	if (parentRef !== undefined && !isReference(parentRef)) throw new ArtifactShapeError(`meta.envelope of ${id} has a parent that is not a reference`);
	const bindingRef = envelope?.['binding'];
	if (bindingRef !== undefined && !isBinding(bindingRef)) throw new ArtifactShapeError(`meta.envelope of ${id} has a malformed binding`);
	const revision = typeof meta['revision'] === 'number' && Number.isInteger(meta['revision']) && meta['revision'] >= 0 ? meta['revision'] : 0;
	const description = envelope?.['description'];

	const artifact: Artifact<HeadPayload> = {
		id,
		description: typeof description === 'string' ? description : '',
		parent:      envelope?.['parent'] as Reference | undefined,
		references:  (references ?? []) as Reference[],
		lifecycle:   (lifecycle ?? emptyLifecycle(revision)) as unknown as Lifecycle,
		binding:     envelope?.['binding'] as TrackerBinding | undefined,
		attachments: (attachments ?? []) as Attachment[],
		payload:     codec.decode(head),
	};
	return { artifact, head };
}

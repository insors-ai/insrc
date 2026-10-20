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
import type { Actor, Artifact, Attachment, Lifecycle, Reference, TrackerBinding } from './types.js';

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
	const head = parsed as unknown as HeadFile;
	const meta = head.meta;

	const envelope = meta['envelope'];
	if (envelope !== undefined && !isObject(envelope)) throw new ArtifactShapeError(`meta.envelope of ${id} is not an object`);
	const lifecycle = meta['lifecycle'];
	if (lifecycle !== undefined && !(isObject(lifecycle) && typeof lifecycle['status'] === 'string' && isObject(lifecycle['revision']))) {
		throw new ArtifactShapeError(`meta.lifecycle of ${id} is not a lifecycle`);
	}
	const references = envelope?.['references'];
	const attachments = envelope?.['attachments'];
	if ((references !== undefined && !Array.isArray(references)) || (attachments !== undefined && !Array.isArray(attachments))) {
		throw new ArtifactShapeError(`meta.envelope of ${id} has references or attachments that are not lists`);
	}
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

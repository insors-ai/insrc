/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The kind codec registry (sc2). A codec owns how its kind's payload (the head's
 * `body` and `citations`) is read from, and written into, the stored
 * `{ meta, body, citations }` head, and supplies the kind's identity meta on
 * create. The store merges the prior head's meta first, so these identity fields
 * are only built when no head exists.
 */

import { randomUUID } from 'node:crypto';

import { ArtifactIds } from '../artifact-ids.js';
import type { ArtifactIdKind, ArtifactKey } from '../artifact-ids.js';
import { requireEpicAnchor, stampRootAnchor } from '../storage.js';
import { ArtifactShapeError, UnknownArtifactKindError } from './types.js';

/** The stored head, as `writeArtifact` and every raw reader see it. */
export interface HeadFile {
	readonly meta:       Readonly<Record<string, unknown>>;
	readonly body:       Readonly<Record<string, unknown>>;
	readonly citations?: readonly unknown[] | undefined;
}

/** What an artifact's payload is in the envelope: the head's body and citations. */
export interface HeadPayload {
	readonly body:      Readonly<Record<string, unknown>>;
	readonly citations: readonly unknown[];
}

/**
 * Everything a codec needs to build the identity meta of a head that does not
 * exist yet. `epicCreatedAt` is the work item's anchor (never the clock of a
 * non-root record).
 */
export interface CodecContext {
	readonly workflow:      string;
	readonly runId:         string;
	readonly repoPath:      string;
	readonly createdAt:     string;
	readonly epicCreatedAt: string;
	readonly elapsedMs:     number;
	readonly repoIndexedAt: number | null;
	readonly schemaVersion: number;
	readonly epicSlug?:     string | undefined;
	readonly standalone?:   boolean | undefined;
}

/** Supplies the context for a create. Called only when the id has no head. */
export type CreationContextProvider = (key: ArtifactKey) => CodecContext;

export interface KindCodec {
	readonly kind:     ArtifactIdKind;
	/** The `meta.workflow` of a head of this kind. */
	readonly workflow: string;
	decode(head: HeadFile): HeadPayload;
	encode(payload: HeadPayload, key: ArtifactKey, ctx: CodecContext): HeadFile;
}


function identityMeta(key: ArtifactKey, ctx: CodecContext): Record<string, unknown> {
	const hashField = key.kind === 'SPEC' ? 'specHash' : key.kind === 'ISSUE' ? 'issueHash' : 'epicHash';
	return {
		workflow:      ctx.workflow,
		runId:         ctx.runId,
		repoPath:      ctx.repoPath,
		createdAt:     ctx.createdAt,
		epicCreatedAt: ctx.epicCreatedAt,
		elapsedMs:     ctx.elapsedMs,
		repoIndexedAt: ctx.repoIndexedAt,
		schemaVersion: ctx.schemaVersion,
		[hashField]:   key.epicHash,
		...(key.story !== undefined ? { storyId: key.story } : {}),
		...(ctx.epicSlug !== undefined ? { epicSlug: ctx.epicSlug } : {}),
		...(ctx.standalone === true ? { standalone: true } : {}),
	};
}

function codec(kind: ArtifactIdKind, workflow: string): KindCodec {
	return {
		kind,
		workflow,
		decode: head => {
			// An amendment stored before the s9 conversion is a flat record with no meta and body; refuse it here as well as in the decoder.
			if (kind === 'AMD' && (typeof head.meta !== 'object' || head.meta === null || typeof head.body !== 'object' || head.body === null)) {
				throw new ArtifactShapeError('a flat amendment has to be converted by the s9 conversion before it can be read');
			}
			return { body: head.body, citations: head.citations ?? [] };
		},
		encode: (payload, key, ctx) => ({ meta: identityMeta(key, ctx), body: payload.body, citations: payload.citations }),
	};
}

const CODECS: ReadonlyMap<ArtifactIdKind, KindCodec> = new Map(([
	['DEF', 'define'], ['HLD', 'design.epic'], ['LLD', 'design.story'], ['PLAN', 'plan'],
	['SPEC', 'brainstorm'], ['ISSUE', 'issue'], ['BUILD', 'build'], ['CR', 'code-review'],
	['TESTS', 'tests'], ['EXT', 'define'], ['AMD', 'design.epic'],
] as const).map(([kind, workflow]) => [kind, codec(kind, workflow)]));

/** The codec of a kind; kinds with no stored head yet (EPIC, STORY, TASKS, TASK, DIAG) have none. */
export function codecFor(kind: ArtifactIdKind): KindCodec {
	const c = CODECS.get(kind);
	if (c === undefined) throw new UnknownArtifactKindError(`no codec is registered for artifact kind '${kind}'`);
	return c;
}

export function registeredKinds(): readonly ArtifactIdKind[] {
	return [...CODECS.keys()];
}

/**
 * The default creation context for a repository: the kind's workflow name, a fresh run id, the clock for
 * `createdAt`, no elapsed time and no index watermark (the store does not run a workflow), schema version 1,
 * and the work item's anchor — the record's own `createdAt` for a root kind (a Define keeps an anchor already stamped), else the stamped anchor of the
 * work item (a record with no anchor raises `MissingAnchorError` before anything is written).
 */
export function creationContextProvider(
	repoPath: string,
	opts: { readonly now?: (() => Date) | undefined; readonly runId?: string | undefined; readonly epicSlug?: string | undefined; readonly standalone?: boolean | undefined } = {},
): CreationContextProvider {
	return key => {
		const createdAt = (opts.now ?? (() => new Date()))().toISOString();
		// A Define keeps an anchor already stamped for its hash. A SPEC or ISSUE is keyed by its own run hash,
		// has no earlier head, and starts the work item, so its own clock is the anchor. Every other kind reads
		// the stamp.
		const epicCreatedAt = key.kind === 'DEF' ? stampRootAnchor(repoPath, key.epicHash, createdAt)
			: key.kind === 'SPEC' || key.kind === 'ISSUE' ? createdAt
			: requireEpicAnchor(repoPath, key.epicHash);
		return {
			workflow:      codecFor(key.kind).workflow,
			runId:         opts.runId ?? `store-${randomUUID()}`,
			repoPath,
			createdAt,
			epicCreatedAt,
			elapsedMs:     0,
			repoIndexedAt: null,
			schemaVersion: 1,
			epicSlug:      opts.epicSlug,
			standalone:    opts.standalone,
		};
	};
}

/** Parse an id once for codec lookups. */
export function keyOf(id: string): ArtifactKey | undefined {
	return ArtifactIds.parse(id);
}

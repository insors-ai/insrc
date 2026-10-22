/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The head of a unit: the EPIC head of an Epic and the STORY head of a Story. The unit's issue is bound on it (./binding.ts), so
 * every reader of the Epic's or the Story's issue goes through {@link unitIssueOf}, and the unit that needs a place to be bound is
 * given its head here when it has none yet. A head the conversion made is found and left as it is.
 *
 * The head is a draft with an empty body, the pass-through shape the store writes for these kinds: the identity meta, the
 * envelope (with the Story's parent, the Epic), a lifecycle at revision 1 and the `create` entry of its log.
 */

import { existsSync } from 'node:fs';

import { ArtifactIds } from '../artifact-ids.js';
import { contentHash } from '../artifact-core/lifecycle.js';
import { FileSidecarStore } from '../artifact-core/sidecar-store.js';
import type { Actor } from '../artifact-core/types.js';
import { artifactJsonPath, resolveEpicAnchor, writeArtifact } from '../storage.js';
import { readBinding } from './binding.js';
import type { UnitRef } from './refs.js';

const UNIT_ACTOR: Actor = { id: 'insrc:tracker', kind: 'system', properties: {} };

/** The id of the head that holds the Epic's or the Story's binding, or undefined for a Task or an id that makes none. */
export function unitHeadId(unit: Pick<UnitRef, 'unit' | 'epicHash' | 'storyId'>): string | undefined {
	if (unit.unit === 'epic') return ArtifactIds.tryMake({ kind: 'EPIC', epicHash: unit.epicHash });
	if (unit.unit === 'story' && unit.storyId !== undefined) return ArtifactIds.tryMake({ kind: 'STORY', epicHash: unit.epicHash, story: unit.storyId });
	return undefined;
}

/** The issue bound on the Epic's head (or, with a Story, on the Story's), or undefined when it has none or cannot be read. */
export function unitIssueOf(repoPath: string, epicHash: string, storyId?: string): string | undefined {
	const id = unitHeadId({ unit: storyId === undefined ? 'epic' : 'story', epicHash, ...(storyId !== undefined ? { storyId } : {}) });
	if (id === undefined) return undefined;
	try { return readBinding(repoPath, id)?.reference.entityId; } catch { return undefined; }
}

/**
 * Give the unit its head when it has none. False when it could not be made: the Epic has no creation time to anchor its folder
 * (no Define), or the write failed. Never throws.
 */
export function ensureUnitHead(unit: UnitRef, now: () => string = () => new Date().toISOString()): boolean {
	const id = unitHeadId(unit);
	if (id === undefined) return false;
	const path = artifactJsonPath(unit.repoPath, id);
	if (existsSync(path)) return true;
	try {
		const anchor = resolveEpicAnchor(unit.repoPath, unit.epicHash);
		if (anchor === undefined) return false;
		const at = now();
		const parent = unit.unit === 'story' ? { entityId: ArtifactIds.make({ kind: 'EPIC', epicHash: unit.epicHash }), type: 'EPIC', relation: 'derived-from' } : undefined;
		const description = '';
		const payload = { body: {}, citations: [] };
		const head = {
			meta: {
				workflow: 'define', runId: `unit-${id}`, repoPath: unit.repoPath, createdAt: at, epicCreatedAt: anchor,
				elapsedMs: 0, repoIndexedAt: null, schemaVersion: 1, epicHash: unit.epicHash,
				...(unit.unit === 'story' && unit.storyId !== undefined ? { storyId: unit.storyId } : {}),
				envelope: { description, ...(parent !== undefined ? { parent } : {}), references: [], attachments: [] },
				lifecycle: { status: 'draft', revision: { number: 1, contentHash: contentHash(description, payload), at, by: UNIT_ACTOR }, signoffs: [] },
				revision: 1,
			},
			...payload,
		};
		writeArtifact(path, head, 'content');
		new FileSidecarStore(unit.repoPath).appendRecordSync('log', {
			artifactId: id,
			entry: { id: `create-${id}`, actor: UNIT_ACTOR, timestamp: at, operation: 'create', revision: { number: 1, contentHash: contentHash(description, payload) } },
		});
		return true;
	} catch { return false; }
}

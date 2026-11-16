/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Retry-safe reconciliation of explicit artifact replacements. A batch is not
 * transactionally atomic across artifact files, so every member is preflighted
 * before the first write and a retry accepts only the exact supersession it was
 * asked to make. This makes a crash between members safe to resume without
 * erasing either artifact's history.
 */

import { ArtifactIds } from '../artifact-ids.js';
import type { LifecycleService } from './lifecycle-service.js';
import { IllegalTransitionError, LifecycleConflictError } from './types.js';
import type { Actor, Reference } from './types.js';

export interface ArtifactSupersession {
	readonly artifactId: string;
	readonly supersededBy: Reference;
}

export interface SupersessionResult {
	readonly changed: readonly string[];
	readonly standing: readonly string[];
}

function sameReference(left: Reference, right: Reference): boolean {
	return left.entityId === right.entityId && left.type === right.type && left.relation === right.relation
		&& left.fragment === right.fragment && left.quote === right.quote;
}

function requireReplacementReference(item: ArtifactSupersession): void {
	const source = ArtifactIds.parse(item.artifactId);
	const replacement = ArtifactIds.parse(item.supersededBy.entityId);
	if (source === undefined || replacement === undefined || item.supersededBy.type !== replacement.kind
		|| item.supersededBy.relation !== 'supersedes') {
		throw new IllegalTransitionError(`Supersession of ${item.artifactId} needs a valid replacement artifact reference with relation 'supersedes'`);
	}
}

async function isStanding(service: LifecycleService, item: ArtifactSupersession): Promise<boolean> {
	const stored = await service.store.readWithHistory(item.artifactId);
	if (stored.lifecycle.status !== 'superseded') return false;
	const headReference = stored.references.some(ref => sameReference(ref, item.supersededBy));
	const logReference = [...stored.changeLog].reverse().find(entry => entry.operation === 'supersede')
		?.references?.some(ref => sameReference(ref, item.supersededBy)) === true;
	if (!headReference || !logReference) {
		throw new IllegalTransitionError(`${item.artifactId} is superseded without the requested replacement provenance`);
	}
	return true;
}

/**
 * Supersede every source with its exact replacement. Predictable failures are
 * found before any write; an interruption after a committed member is resumed
 * by calling this function again with the same batch.
 */
export async function reconcileArtifactSupersessions(
	service: LifecycleService,
	items: readonly ArtifactSupersession[],
	actor: Actor,
): Promise<SupersessionResult> {
	const seen = new Set<string>();
	const standing = new Set<string>();
	for (const item of items) {
		requireReplacementReference(item);
		if (seen.has(item.artifactId)) {
			throw new IllegalTransitionError(`Supersession batch contains ${item.artifactId} more than once`);
		}
		seen.add(item.artifactId);
		await service.store.read(item.supersededBy.entityId);
		const inspection = await service.inspect(item.artifactId);
		if (inspection === undefined) throw new IllegalTransitionError(`Supersession source ${item.artifactId} is missing`);
		if (!inspection.integrity.ok) throw new LifecycleConflictError(item.artifactId, inspection.integrity.reason);
		if (inspection.status === 'superseded') {
			if (await isStanding(service, item)) standing.add(item.artifactId);
		}
	}

	const changed: string[] = [];
	for (const item of items) {
		if (!standing.has(item.artifactId)) {
			await service.apply(item.artifactId, 'supersede', actor, { supersededBy: item.supersededBy });
			changed.push(item.artifactId);
		}
		if (!(await isStanding(service, item))) {
			throw new IllegalTransitionError(`Supersession readback failed for ${item.artifactId}`);
		}
	}
	return { changed, standing: [...standing] };
}

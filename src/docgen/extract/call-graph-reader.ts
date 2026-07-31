/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — graph-backed CallGraphReader (Epic 870ed3dd, Story s3).
 *
 * The daemon-side read seam for the call-sequence extractor: resolve an
 * entry-point symbol to a function/method frame, and fetch a frame's 1-hop
 * CALLS successors. The bounded DFS + cycle/depth logic lives in the pure
 * extractor core; this reader only fetches. Reads happen inside the daemon
 * (k2), never an LLM (k8). Direct analogue of s2's component-graph-reader.ts,
 * differing in the relation (CALLS vs IMPORTS) + the entry-point resolution.
 */

import type { Entity, EntityKind } from '../../shared/types.js';
import { findEntitiesByName, getEntity, entityU64ForId, entityIdsByU64s } from '../../db/entities.js';
import { outNeighbors } from '../../db/graph/edges.js';
import { listRepos } from '../../db/repos.js';

import type { CallGraphReader, CallFrameRef, CallSequenceScope } from './call-sequence.js';

const FRAME_KINDS: readonly EntityKind[] = ['function', 'method'];

function toFrame(e: Entity): CallFrameRef {
	return { entityId: e.id, name: e.name, file: e.file, startLine: e.startLine };
}

/** Deterministic tie-break for a multi-match symbol name: stable (file, startLine)
 *  order, so the same request always resolves to the same entry point. */
function pickDeterministic(entities: readonly Entity[]): Entity | undefined {
	const sorted = [...entities].sort((a, b) =>
		a.file === b.file ? a.startLine - b.startLine : a.file < b.file ? -1 : 1);
	return sorted[0];
}

export const callGraphReader: CallGraphReader = {
	async revision(repoRoot: string): Promise<string | undefined> {
		const repos = await listRepos(undefined);
		const repo = repos.find(r => r.path === repoRoot);
		if (repo === undefined || repo.status !== 'ready') return undefined;
		return repo.lastIndexed ?? repo.addedAt;
	},

	async resolveEntryPoint(scope: CallSequenceScope): Promise<CallFrameRef | undefined> {
		const matches = await findEntitiesByName(undefined, [scope.symbol], {
			kinds: FRAME_KINDS,
			repo:  scope.repoRoot,
		});
		const chosen = pickDeterministic(matches);
		return chosen === undefined ? undefined : toFrame(chosen);
	},

	async calleesOf(entityId: string): Promise<readonly CallFrameRef[]> {
		const u64 = await entityU64ForId(entityId);
		if (u64 === undefined) return [];
		const neighbors = await outNeighbors(u64, { kindFilter: ['CALLS'] });
		if (neighbors.length === 0) return [];
		const idByU64 = await entityIdsByU64s(neighbors);
		const frames: CallFrameRef[] = [];
		for (const nb of neighbors) {
			const calleeId = idByU64.get(nb);
			// A CALLS neighbor whose u64 has no resolved entity id (dangling edge /
			// unindexed target) is dropped — only graph-backed frames appear (k11).
			if (calleeId === undefined) continue;
			const entity = await getEntity(undefined, calleeId);
			if (entity === null) continue;
			frames.push(toFrame(entity));
		}
		return frames;
	},
};

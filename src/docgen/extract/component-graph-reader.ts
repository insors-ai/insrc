/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — graph-backed ComponentGraphReader (Epic 870ed3dd, Story s2).
 *
 * The daemon-side read seam for the component/dependency extractor: file
 * entities in scope + their file→file IMPORTS edges. Aggregation to component
 * (directory) level happens in the pure extractor core; this reader only
 * fetches. Reads happen inside the daemon (k2), never an LLM (k8).
 */

import { join } from 'node:path';

import type { EntityKind } from '../../shared/types.js';
import { listEntitiesByKinds, entityU64ForId, entityIdsByU64s } from '../../db/entities.js';
import { outNeighbors } from '../../db/graph/edges.js';
import { listRepos } from '../../db/repos.js';

import type {
	ComponentGraphReader,
	ComponentScope,
	FileEntityLite,
	FileImportEdge,
} from './component-dependency.js';

const FILE_KINDS: readonly EntityKind[] = ['file'];

function underScope(file: string, repoRoot: string, prefix: string): boolean {
	const base = join(repoRoot, prefix);
	return file === base || file.startsWith(base.endsWith('/') ? base : `${base}/`);
}

export const componentGraphReader: ComponentGraphReader = {
	async revision(repoRoot: string): Promise<string | undefined> {
		const repos = await listRepos(undefined);
		const repo = repos.find(r => r.path === repoRoot);
		if (repo === undefined || repo.status !== 'ready') return undefined;
		return repo.lastIndexed ?? repo.addedAt;
	},

	async filesInScope(scope: ComponentScope): Promise<readonly FileEntityLite[]> {
		const files = await listEntitiesByKinds(undefined, FILE_KINDS, { repo: scope.repoRoot });
		const scoped = scope.path !== undefined && scope.path.length > 0
			? files.filter(e => underScope(e.file, scope.repoRoot, scope.path!))
			: files;
		return scoped.map(e => ({ id: e.id, file: e.file }));
	},

	async importEdges(fileIds: readonly string[]): Promise<readonly FileImportEdge[]> {
		const edges: FileImportEdge[] = [];
		for (const fromFileId of fileIds) {
			const u64 = await entityU64ForId(fromFileId);
			if (u64 === undefined) continue;
			const neighbors = await outNeighbors(u64, { kindFilter: ['IMPORTS'] });
			if (neighbors.length === 0) continue;
			const idByU64 = await entityIdsByU64s(neighbors);
			for (const nb of neighbors) {
				const toFileId = idByU64.get(nb);
				// Unresolved imports (external module stubs) have no resolved file
				// id → dropped here; in-scope filtering happens in the extractor core.
				if (toFileId !== undefined) edges.push({ fromFileId, toFileId });
			}
		}
		return edges;
	},
};

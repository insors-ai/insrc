/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * docgen — graph-backed TypeGraphReader (Epic 870ed3dd, Story s1 · t5-reader).
 *
 * The real implementation of the extractor's read seam, running inside the
 * daemon with direct graph access (k2): reads type entities in a scope and
 * their INHERITS/IMPLEMENTS relations from the code graph. No caller ever
 * reaches the store — only the finished IR (and later the shell) travels out.
 *
 * The graph query functions self-open the graph store (`getGraphStore`); their
 * `DbClient` parameter is vestigial (`DbClient = unknown`), so `undefined` is
 * passed through.
 */

import { join } from 'node:path';

import type { EntityKind, RelationKind } from '../../shared/types.js';
import { listEntitiesByKinds, entityU64ForId, entityIdsByU64s } from '../../db/entities.js';
import { outNeighbors } from '../../db/graph/edges.js';
import { listRepos } from '../../db/repos.js';

import type { TypeGraphReader, TypeEntity, TypeScope, InheritanceRel } from './type-structure.js';

const TYPE_KINDS: readonly EntityKind[] = ['class', 'interface', 'type'];

/** (RelationKind, IR edge kind) pairs the extractor draws. */
const INHERITANCE: readonly (readonly [RelationKind, InheritanceRel['kind']])[] = [
	['INHERITS', 'inherits'],
	['IMPLEMENTS', 'implements'],
];

/** Is the absolute `file` under `repoRoot/prefix`? */
function underScope(file: string, repoRoot: string, prefix: string): boolean {
	const base = join(repoRoot, prefix);
	return file === base || file.startsWith(base.endsWith('/') ? base : `${base}/`);
}

/**
 * The daemon-side graph reader. All reads are graph queries — never an LLM
 * (k8). `revision` pins the repo's indexed state so repeated generation over
 * unchanged code is byte-identical.
 */
export const graphTypeReader: TypeGraphReader = {
	async revision(repoRoot: string): Promise<string | undefined> {
		const repos = await listRepos(undefined);
		const repo = repos.find(r => r.path === repoRoot);
		// Not registered OR not finished indexing → no pinnable revision. The
		// extractor maps this to source-not-ready (an actionable outcome: add +
		// index the repo via repo.add).
		if (repo === undefined || repo.status !== 'ready') return undefined;
		return repo.lastIndexed ?? repo.addedAt;
	},

	async typesInScope(scope: TypeScope): Promise<readonly TypeEntity[]> {
		const entities = await listEntitiesByKinds(undefined, TYPE_KINDS, { repo: scope.repoRoot });
		const scoped = scope.path !== undefined && scope.path.length > 0
			? entities.filter(e => underScope(e.file, scope.repoRoot, scope.path!))
			: entities;
		return scoped.map(e => ({
			id:        e.id,
			name:      e.name,
			kind:      e.kind,
			file:      e.file,
			startLine: e.startLine,
		}));
	},

	async inheritanceEdges(entityIds: readonly string[]): Promise<readonly InheritanceRel[]> {
		const rels: InheritanceRel[] = [];
		for (const fromId of entityIds) {
			const u64 = await entityU64ForId(fromId);
			if (u64 === undefined) continue;
			for (const [relKind, irKind] of INHERITANCE) {
				const neighbors = await outNeighbors(u64, { kindFilter: [relKind] });
				if (neighbors.length === 0) continue;
				const idByU64 = await entityIdsByU64s(neighbors);
				for (const nb of neighbors) {
					const toId = idByU64.get(nb);
					if (toId !== undefined) rels.push({ fromId, toId, kind: irKind });
				}
			}
		}
		return rels;
	},
};

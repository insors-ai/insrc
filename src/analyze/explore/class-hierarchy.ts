/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * class.hierarchy exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 3. Given a class (by
 * symbolName OR entityId), walk INHERITS + IMPLEMENTS edges in both
 * directions and return a compact hierarchy node the synthesizer can
 * fold into `structure` / `surface`.
 *
 * Backing: `outNeighbors` / `inNeighbors` with kindFilter=INHERITS +
 * IMPLEMENTS + `entityU64ForId` / `entityIdsByU64s`. Deterministic +
 * repo-scoped. No LLM.
 */

import { getDb } from '../../db/client.js';
import {
	entityU64ForId,
	entityIdsByU64s,
	findEntitiesByName,
	getEntitiesByIds,
	getEntity,
} from '../../db/entities.js';
import { inNeighbors, outNeighbors } from '../../db/graph/edges.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity, EntityKind } from '../../shared/types.js';

import type {
	ClassHierarchyNode,
	ClassHierarchyOutput,
	Exploration,
	ExplorationRunnerContext,
} from './types.js';

const log = getLogger('analyze:explore:class-hierarchy');

const TARGET_KINDS: readonly EntityKind[] = ['class', 'interface', 'type'];

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface ClassHierarchyParams {
	readonly symbolName?: string;
	readonly entityId?:   string;
}

function parseParams(exp: Exploration): ClassHierarchyParams {
	const p = exp.params as Record<string, unknown>;
	const symbolName = typeof p['symbolName'] === 'string'
		? (p['symbolName'] as string).trim()
		: undefined;
	const entityId = typeof p['entityId'] === 'string'
		? (p['entityId'] as string).trim()
		: undefined;
	if ((symbolName === undefined || symbolName.length === 0)
	 && (entityId   === undefined || entityId.length   === 0)) {
		throw new Error(
			'class.hierarchy: one of params.symbolName or params.entityId is required',
		);
	}
	return {
		...(symbolName !== undefined && symbolName.length > 0 ? { symbolName } : {}),
		...(entityId   !== undefined && entityId.length   > 0 ? { entityId }   : {}),
	};
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runClassHierarchy(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<ClassHierarchyOutput> {
	const params = parseParams(exp);
	const db = await getDb();
	const subject = params.symbolName ?? params.entityId ?? '';

	// (1) Resolve target(s). entityId path -> single node; symbolName
	// path -> every matching class/interface in the repo (a name like
	// `Extractor` may repeat across sub-packages, so we surface all).
	let targets: Entity[];
	if (params.entityId !== undefined) {
		const row = await getEntity(db, params.entityId);
		targets = row !== null ? [row] : [];
	} else {
		targets = await findEntitiesByName(
			db,
			[params.symbolName!],
			{ repo: ctx.repoPath, kinds: TARGET_KINDS },
		);
		// Prefer real definitions over test/spec doubles.
		targets = targets.filter(e => e.artifact !== true);
	}
	// Drop targets that live under a currently-gitignored path.
	// `class Extractor` compiled into out/insrc/ shouldn't resolve
	// alongside the source `class Extractor` in src/insrc/.
	targets = targets.filter(e => ctx.ignoreFilter.isIncluded(e.file));

	if (targets.length === 0) {
		log.info(
			{ runId: ctx.runId, subject },
			'class.hierarchy: no target resolved',
		);
		return {
			type:         'class.hierarchy',
			subject,
			nodes:        [],
			notFoundNote: `No class/interface named "${subject}" found in the repo.`,
		};
	}

	// (2) Traverse INHERITS + IMPLEMENTS in both directions per target.
	const nodes: ClassHierarchyNode[] = [];
	for (const t of targets) {
		const u64 = await entityU64ForId(t.id);
		if (u64 === undefined) continue;

		const inheritsOut   = await outNeighbors(u64, { kindFilter: ['INHERITS'] });
		const implementsOut = await outNeighbors(u64, { kindFilter: ['IMPLEMENTS'] });
		const inheritsIn    = await inNeighbors(u64,  { kindFilter: ['INHERITS'] });
		const implementsIn  = await inNeighbors(u64,  { kindFilter: ['IMPLEMENTS'] });

		const extendsIds     = await entityIdsByU64s(inheritsOut);
		const implementsIds  = await entityIdsByU64s(implementsOut);
		const subclassIds    = await entityIdsByU64s(inheritsIn);
		const implementerIds = await entityIdsByU64s(implementsIn);

		// Drop neighbors under gitignored paths so a compiled-JS class
		// under out/ doesn't show up alongside the authored source
		// class as a phantom subclass or implementer.
		const includeE = (e: Entity): boolean => ctx.ignoreFilter.isIncluded(e.file);
		const extendsEnts     = (await hydrate(extendsIds)).filter(includeE);
		const implementsEnts  = (await hydrate(implementsIds)).filter(includeE);
		const subclassEnts    = (await hydrate(subclassIds)).filter(includeE);
		const implementerEnts = (await hydrate(implementerIds)).filter(includeE);

		nodes.push({
			entityId:  t.id,
			name:      t.name,
			kind:      t.kind,
			file:      t.file,
			startLine: t.startLine,
			extendsList:    extendsEnts.map(e => ({
				entityId: e.id,
				name:     e.name,
				file:     e.file,
			})),
			implementsList: implementsEnts.map(e => ({
				entityId: e.id,
				name:     e.name,
				file:     e.file,
			})),
			subclasses:     subclassEnts.map(e => ({
				entityId: e.id,
				name:     e.name,
				file:     e.file,
			})),
			implementers:   implementerEnts.map(e => ({
				entityId: e.id,
				name:     e.name,
				file:     e.file,
			})),
		});
	}

	log.info(
		{
			runId:   ctx.runId,
			subject,
			targets: targets.length,
			nodes:   nodes.length,
		},
		'class.hierarchy: complete',
	);

	return {
		type:         'class.hierarchy',
		subject,
		nodes,
		notFoundNote: '',
	};

	async function hydrate(idMap: Map<bigint, string>): Promise<Entity[]> {
		const stringIds: string[] = [];
		for (const sid of idMap.values()) stringIds.push(sid);
		if (stringIds.length === 0) return [];
		return getEntitiesByIds(db, stringIds);
	}
}

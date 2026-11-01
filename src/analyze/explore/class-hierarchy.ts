import { captureAnalysisDiagnostics } from '../connection-access.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * class.hierarchy exploration runner.
 *
 * docs/plans/exploration-based-context-build.md Phase 3. Given a class (by
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
import { inNeighbors, outNeighbors, type NeighborRelation } from '../../db/graph/edges.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity, EntityKind, RelationEvidence } from '../../shared/types.js';

import type {
	ClassHierarchyNode,
	ClassHierarchyOutput,
	Exploration,
	ExplorationRunnerContext,
} from './types.js';
import { graphCompleteness } from './completeness-facts.js';

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
		captureAnalysisDiagnostics(log, ctx.connectionExecution).emit('info', () => [{ runId: ctx.runId, subject }, 'class.hierarchy: no target resolved']);
		return {
			type:         'class.hierarchy',
			// The graph holds no class or interface of this name: empty, and complete.
			completeness: graphCompleteness({ returned: 0, repoCompleteness: ctx.repoCompleteness }),
			subject,
			nodes:        [],
			notFoundNote: `No class/interface named "${subject}" found in the repo.`,
		};
	}

	// (2) Traverse INHERITS + IMPLEMENTS in both directions per target.
	const nodes: ClassHierarchyNode[] = [];
	const noGraphNode: Entity[] = [];
	for (const t of targets) {
		const u64 = await entityU64ForId(t.id);
		if (u64 === undefined) { noGraphNode.push(t); continue; }

		// With each relationship's evidence (Epic c2ba6fa6 s7): one kind per
		// read, so each neighbour has one relationship.
		const inheritsOut   = await outNeighbors(u64, { kindFilter: ['INHERITS'], withEvidence: true });
		const implementsOut = await outNeighbors(u64, { kindFilter: ['IMPLEMENTS'], withEvidence: true });
		const inheritsIn    = await inNeighbors(u64,  { kindFilter: ['INHERITS'], withEvidence: true });
		const implementsIn  = await inNeighbors(u64,  { kindFilter: ['IMPLEMENTS'], withEvidence: true });

		const extendsIds     = await entityIdsByU64s(inheritsOut.map(r => r.u64));
		const implementsIds  = await entityIdsByU64s(implementsOut.map(r => r.u64));
		const subclassIds    = await entityIdsByU64s(inheritsIn.map(r => r.u64));
		const implementerIds = await entityIdsByU64s(implementsIn.map(r => r.u64));
		/** entity id -> the evidence of its relationship in one of the four lists. */
		const evidenceById = (rows: readonly NeighborRelation[], ids: ReadonlyMap<bigint, string>): Map<string, RelationEvidence> =>
			new Map(rows.flatMap(r => { const id = ids.get(r.u64); return id === undefined ? [] : [[id, r.evidence] as const]; }));
		const extendsEvidence     = evidenceById(inheritsOut, extendsIds);
		const implementsEvidence  = evidenceById(implementsOut, implementsIds);
		const subclassEvidence    = evidenceById(inheritsIn, subclassIds);
		const implementerEvidence = evidenceById(implementsIn, implementerIds);

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
				evidence: extendsEvidence.get(e.id) ?? 'unknown',
			})),
			implementsList: implementsEnts.map(e => ({
				entityId: e.id,
				name:     e.name,
				file:     e.file,
				evidence: implementsEvidence.get(e.id) ?? 'unknown',
			})),
			subclasses:     subclassEnts.map(e => ({
				entityId: e.id,
				name:     e.name,
				file:     e.file,
				evidence: subclassEvidence.get(e.id) ?? 'unknown',
			})),
			implementers:   implementerEnts.map(e => ({
				entityId: e.id,
				name:     e.name,
				file:     e.file,
				evidence: implementerEvidence.get(e.id) ?? 'unknown',
			})),
		});
	}

	captureAnalysisDiagnostics(log, ctx.connectionExecution).emit('info', () => [{
			runId:   ctx.runId,
			subject,
			targets: targets.length,
			nodes:   nodes.length,
	}, 'class.hierarchy: complete']);

	return {
		type:         'class.hierarchy',
		completeness: graphCompleteness({
			repoCompleteness: ctx.repoCompleteness,
			returned: nodes.length,
			found:    targets.length,
			skipped:  noGraphNode.map(e => ({
				what:   `${e.name} (${e.file}:${e.startLine})`,
				reason: 'the class has no node in the stored graph, so its hierarchy was not read',
			})),
		}),
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

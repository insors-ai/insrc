/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * data-model.trace exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 4. Given an entity
 * name (typically a domain class -- Invoice, GRN, PurchaseOrder,
 * ...), enumerate the shape of the model and its neighbourhood: the
 * class definition, its supers, its subclasses, and the top callers
 * that materialise it.
 *
 * Composed: reuses the graph primitives that back symbol.locate,
 * class.hierarchy, and usage.example so the same primitives serve
 * multiple recipes. Deterministic. No LLM.
 */

import { getDb } from '../../db/client.js';
import {
	entityIdsByU64s,
	entityU64ForId,
	findEntitiesByName,
	getEntitiesByIds,
} from '../../db/entities.js';
import { inNeighbors, outNeighbors } from '../../db/graph/edges.js';
import { findCallers } from '../../db/search.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity, EntityKind } from '../../shared/types.js';

import type {
	DataModelField,
	DataModelNode,
	DataModelTraceOutput,
	Exploration,
	ExplorationRunnerContext,
} from './types.js';

const log = getLogger('analyze:explore:data-model-trace');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TARGET_KINDS: readonly EntityKind[] = ['class', 'interface', 'type'];
const MAX_TARGETS      = 4;
const MAX_FIELDS       = 12;
const MAX_TOP_CALLERS  = 6;

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface DataModelTraceParams {
	readonly entityName: string;
}

function parseParams(exp: Exploration): DataModelTraceParams {
	const p = exp.params as Record<string, unknown>;
	const entityName = typeof p['entityName'] === 'string' ? (p['entityName'] as string).trim() : '';
	if (entityName.length === 0) {
		throw new Error('data-model.trace: params.entityName is required (non-empty string)');
	}
	return { entityName };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runDataModelTrace(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<DataModelTraceOutput> {
	const params = parseParams(exp);
	const db = await getDb();

	// (1) Resolve the target(s). Same policy as class.hierarchy: a name
	// may repeat across sub-packages, we surface all real definitions.
	const targets = (
		await findEntitiesByName(
			db,
			[params.entityName],
			{ repo: ctx.repoPath, kinds: TARGET_KINDS },
		)
	)
		.filter(e => e.artifact !== true)
		// Drop stale entities under gitignored paths so a compiled
		// twin of the source doesn't resolve alongside the authored
		// definition.
		.filter(e => ctx.ignoreFilter.isIncluded(e.file))
		.slice(0, MAX_TARGETS);

	if (targets.length === 0) {
		log.info(
			{ runId: ctx.runId, entityName: params.entityName },
			'data-model.trace: no target resolved',
		);
		return {
			type:         'data-model.trace',
			subject:      params.entityName,
			nodes:        [],
			notFoundNote: `No class/interface/type named "${params.entityName}" found in repo "${ctx.repoPath}".`,
		};
	}

	// (2) Walk each target.
	const nodes: DataModelNode[] = [];
	for (const t of targets) {
		const u64 = await entityU64ForId(t.id);
		if (u64 === undefined) continue;

		const inheritsOut = await outNeighbors(u64, { kindFilter: ['INHERITS'] });
		const inheritsIn  = await inNeighbors(u64,  { kindFilter: ['INHERITS'] });
		const definesOut  = await outNeighbors(u64, { kindFilter: ['DEFINES'] });

		const extendsMap    = await entityIdsByU64s(inheritsOut);
		const subMap        = await entityIdsByU64s(inheritsIn);
		const fieldMap      = await entityIdsByU64s(definesOut);

		const extendsEnts = await hydrate(Array.from(extendsMap.values()));
		const subEnts     = await hydrate(Array.from(subMap.values()));
		const fieldEnts   = await hydrate(Array.from(fieldMap.values()));

		// Callers: 1-hop CALLS predecessors. Rank by file+line for
		// stability.
		const callers = await findCallers(db, t.id);
		callers.sort((a, b) => {
			if (a.file !== b.file) return a.file.localeCompare(b.file);
			return a.startLine - b.startLine;
		});

		const fields: DataModelField[] = fieldEnts
			.filter(e => isFieldLike(e.kind))
			.slice(0, MAX_FIELDS)
			.map(e => ({
				name: e.name,
				...(e.signature !== undefined && e.signature.length > 0 ? { type: e.signature } : {}),
			}));

		nodes.push({
			entityId:  t.id,
			name:      t.name,
			kind:      t.kind,
			file:      t.file,
			startLine: t.startLine,
			fields,
			extendsList: extendsEnts.map(e => ({
				entityId: e.id,
				name:     e.name,
				file:     e.file,
			})),
			subclasses: subEnts.map(e => ({
				entityId: e.id,
				name:     e.name,
				file:     e.file,
			})),
			topCallers: callers.slice(0, MAX_TOP_CALLERS).map(e => ({
				entityId: e.id,
				name:     e.name,
				file:     e.file,
				line:     e.startLine,
			})),
		});
	}

	log.info(
		{
			runId:      ctx.runId,
			entityName: params.entityName,
			targets:    targets.length,
			nodes:      nodes.length,
		},
		'data-model.trace: complete',
	);

	return {
		type:         'data-model.trace',
		subject:      params.entityName,
		nodes,
		notFoundNote: '',
	};

	async function hydrate(ids: readonly string[]): Promise<Entity[]> {
		if (ids.length === 0) return [];
		return getEntitiesByIds(db, [...ids]);
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFieldLike(kind: string): boolean {
	// Kinds captured by the tree-sitter parsers that read as fields
	// / attributes / typed properties on a class. Guarded loose so a
	// new parser doesn't silently drop from the trace.
	return kind === 'variable' || kind === 'property' || kind === 'field' || kind === 'attribute';
}

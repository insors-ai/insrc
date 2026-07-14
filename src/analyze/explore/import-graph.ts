/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * import.graph exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 1. Given a module
 * (directory) or a file, summarise its IMPORTS graph:
 *   - topImporters: top-K files (outside `target`) that import from
 *     any file inside `target`. Ranked by edge count.
 *   - topImportees: top-K files (outside `target`) that files inside
 *     `target` import from. Ranked by edge count.
 *   - totalInDegree / totalOutDegree: raw sums.
 *
 * This exploration is what surfaces reusability signals: a module
 * with a HIGH in-degree (many importers) is heavily reused. The
 * decomposer's `capability.reuse-check` recipe (Phase 3) reads
 * these numbers directly.
 *
 * Backing: LMDB in_edge / out_edge sub-DBs via inNeighbors +
 * outNeighbors on File-entity u64s. Repo-scoped by
 * ExplorationRunnerContext.repoPath.
 */

import { sep } from 'node:path';

import { getDb } from '../../db/client.js';
import { getEntitiesByIds, entityU64ForId, entityIdsByU64s, listEntitiesForRepo } from '../../db/entities.js';
import { inNeighbors, outNeighbors } from '../../db/graph/edges.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity } from '../../shared/types.js';

import type {
	Exploration,
	ExplorationRunnerContext,
	ImportGraphOutput,
	ImportGraphSummary,
} from './types.js';

const log = getLogger('analyze:explore:import-graph');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K = 15;
const MAX_TOP_K = 60;

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface ImportGraphParams {
	readonly path:   string;
	readonly topK?: number;
}

function parseParams(exp: Exploration): ImportGraphParams {
	const p = exp.params as Record<string, unknown>;
	const path = typeof p['path'] === 'string' ? (p['path'] as string) : '';
	if (path.length === 0) {
		throw new Error(`import.graph: params.path is required`);
	}
	const topK = typeof p['topK'] === 'number' && p['topK']! > 0
		? Math.min(MAX_TOP_K, Math.floor(p['topK'] as number))
		: DEFAULT_TOP_K;
	return { path, topK };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runImportGraph(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<ImportGraphOutput> {
	const { path, topK } = parseParams(exp);

	const db = await getDb();
	const allEntities = await listEntitiesForRepo(db, ctx.repoPath);

	// Collect File entities WITHIN `path`. Treat `path` as either a
	// directory prefix or an exact file path. Drop stale entities
	// under gitignored paths (out/, build/, dist/, ...) so we don't
	// build the graph across the compiled twin of the source tree.
	const inScopeFiles: Entity[] = [];
	const pathWithSep = path.endsWith(sep) ? path : path + sep;
	for (const e of allEntities) {
		if (e.kind !== 'file') continue;
		if (!ctx.ignoreFilter.isIncluded(e.file)) continue;
		if (e.file === path || e.file.startsWith(pathWithSep)) {
			inScopeFiles.push(e);
		}
	}

	if (inScopeFiles.length === 0) {
		log.info({ runId: ctx.runId, path }, 'import.graph: no in-scope files');
		return {
			type: 'import.graph',
			summary: {
				target: path,
				topImporters:   [],
				topImportees:   [],
				totalInDegree:  0,
				totalOutDegree: 0,
			},
		};
	}

	// For each in-scope file, count inbound + outbound IMPORTS edges
	// crossing the module boundary (i.e. the neighbour is a file
	// OUTSIDE `path`).
	const importerCount = new Map<string, number>();  // otherFile -> edges
	const importeeCount = new Map<string, number>();  // otherFile -> edges
	let totalIn  = 0;
	let totalOut = 0;

	const inScopePaths = new Set(inScopeFiles.map(e => e.file));

	for (const f of inScopeFiles) {
		const u64 = await entityU64ForId(f.id);
		if (u64 === undefined) continue;

		// Inbound: who imports THIS file (files outside our scope).
		const importers = await inNeighbors(u64, { kindFilter: ['IMPORTS'] });
		const importerIdMap = await entityIdsByU64s(importers);
		const importerIds: string[] = [];
		for (const u of importers) {
			const sid = importerIdMap.get(u);
			if (sid !== undefined) importerIds.push(sid);
		}
		const importerEntities = await getEntitiesByIds(db, importerIds);
		for (const ie of importerEntities) {
			if (ie.repo !== ctx.repoPath) continue;
			if (!ctx.ignoreFilter.isIncluded(ie.file)) continue;
			if (inScopePaths.has(ie.file)) continue;
			importerCount.set(ie.file, (importerCount.get(ie.file) ?? 0) + 1);
			totalIn += 1;
		}

		// Outbound: what THIS file imports (files outside our scope).
		const importees = await outNeighbors(u64, { kindFilter: ['IMPORTS'] });
		const importeeIdMap = await entityIdsByU64s(importees);
		const importeeIds: string[] = [];
		for (const u of importees) {
			const sid = importeeIdMap.get(u);
			if (sid !== undefined) importeeIds.push(sid);
		}
		const importeeEntities = await getEntitiesByIds(db, importeeIds);
		for (const ie of importeeEntities) {
			if (ie.repo !== ctx.repoPath) continue;
			if (!ctx.ignoreFilter.isIncluded(ie.file)) continue;
			if (inScopePaths.has(ie.file)) continue;
			importeeCount.set(ie.file, (importeeCount.get(ie.file) ?? 0) + 1);
			totalOut += 1;
		}
	}

	const topImporters = Array.from(importerCount.entries())
		.map(([file, edges]) => ({ file, edges }))
		.sort((a, b) => b.edges - a.edges)
		.slice(0, topK ?? DEFAULT_TOP_K);
	const topImportees = Array.from(importeeCount.entries())
		.map(([file, edges]) => ({ file, edges }))
		.sort((a, b) => b.edges - a.edges)
		.slice(0, topK ?? DEFAULT_TOP_K);

	const summary: ImportGraphSummary = {
		target:         path,
		topImporters,
		topImportees,
		totalInDegree:  totalIn,
		totalOutDegree: totalOut,
	};

	log.info(
		{
			runId:         ctx.runId,
			path,
			inScopeFiles:  inScopeFiles.length,
			totalIn,
			totalOut,
			topImporters:  topImporters.length,
			topImportees:  topImportees.length,
		},
		'import.graph: complete',
	);

	return { type: 'import.graph', summary };
}

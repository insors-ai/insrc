/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * usage.example exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 3. Given a symbol
 * (by name OR entityId), enumerate the callers that invoke it. The
 * synthesizer uses this to cite real code sites in adherence /
 * capability / how-does-it-work bundles.
 *
 * Backing: `findCallers` (1-hop CALLS predecessors) from db/search.
 * Deterministic + repo-closure-scoped. No LLM.
 */

import { getDb } from '../../db/client.js';
import { findCallers } from '../../db/search.js';
import { findEntitiesByName, getEntity } from '../../db/entities.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity, EntityKind } from '../../shared/types.js';

import type {
	Exploration,
	ExplorationRunnerContext,
	UsageExampleHit,
	UsageExampleOutput,
} from './types.js';

const log = getLogger('analyze:explore:usage-example');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K = 12;
const MAX_TOP_K     = 40;

const DEFAULT_TARGET_KINDS: readonly EntityKind[] = [
	'function', 'method', 'class',
];

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface UsageExampleParams {
	/** Either symbolName OR entityId is required. When both are
	 *  supplied, entityId wins. */
	readonly symbolName?: string;
	readonly entityId?:   string;
	readonly kinds?:      readonly EntityKind[];
	readonly topK?:       number;
}

function parseParams(exp: Exploration): UsageExampleParams {
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
			'usage.example: one of params.symbolName or params.entityId is required',
		);
	}
	const kindsRaw = p['kinds'];
	const kinds = Array.isArray(kindsRaw)
		? kindsRaw.filter(k => typeof k === 'string') as EntityKind[]
		: undefined;
	const topK = typeof p['topK'] === 'number' && p['topK']! > 0
		? Math.min(MAX_TOP_K, Math.floor(p['topK'] as number))
		: DEFAULT_TOP_K;
	return {
		...(symbolName !== undefined && symbolName.length > 0 ? { symbolName } : {}),
		...(entityId   !== undefined && entityId.length   > 0 ? { entityId }   : {}),
		...(kinds      !== undefined && kinds.length > 0     ? { kinds }      : {}),
		topK,
	};
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runUsageExample(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<UsageExampleOutput> {
	const params = parseParams(exp);
	const db = await getDb();

	// (1) Resolve the target entity. If entityId is given, use it
	// verbatim. Otherwise resolve symbolName via findEntitiesByName;
	// if that returns multiple candidates, pick the top hit but log
	// the ambiguity so the synthesizer knows.
	const targetKinds = params.kinds ?? DEFAULT_TARGET_KINDS;
	let target: Entity | undefined;
	let ambiguousCandidates = 0;
	if (params.entityId !== undefined) {
		const row = await getEntity(db, params.entityId);
		if (row !== null) target = row;
	} else {
		const rows = (
			await findEntitiesByName(
				db,
				[params.symbolName!],
				{ repo: ctx.repoPath, kinds: targetKinds },
			)
		)
			// Drop stale entities under gitignored paths so the compiled
			// twin doesn't hijack the usage-example resolution.
			.filter(r => ctx.ignoreFilter.isIncluded(r.file));
		ambiguousCandidates = rows.length;
		if (rows.length > 0) {
			// Prefer the non-artefact / non-test-path candidate.
			const preferred = rows.find(r => r.artifact !== true
				&& !/(^|\/)(tests?|__tests__|test|spec|specs)\//i.test(r.file));
			target = preferred ?? rows[0]!;
		}
	}

	if (target === undefined) {
		log.info(
			{
				runId:      ctx.runId,
				symbolName: params.symbolName,
				entityId:   params.entityId,
				ambiguous:  ambiguousCandidates,
			},
			'usage.example: target not resolved; returning empty output',
		);
		return {
			type:         'usage.example',
			subject:      params.symbolName ?? params.entityId ?? '',
			callers:      [],
			totalCallers: 0,
		};
	}

	// (2) 1-hop callers via CALLS predecessors.
	const callers = await findCallers(db, target.id);

	// (3) Cap deterministically -- rank by file+line so results are
	// reproducible across runs (same input, same output).
	callers.sort((a, b) => {
		if (a.file !== b.file) return a.file.localeCompare(b.file);
		return a.startLine - b.startLine;
	});
	const topK = params.topK ?? DEFAULT_TOP_K;
	const capped = callers.slice(0, topK);

	const hits: UsageExampleHit[] = capped.map(e => ({
		entityId:  e.id,
		name:      e.name,
		kind:      e.kind,
		file:      e.file,
		startLine: e.startLine,
		endLine:   e.endLine,
		...(e.signature !== undefined && e.signature.length > 0 ? { signature: e.signature } : {}),
	}));

	log.info(
		{
			runId:         ctx.runId,
			subject:       params.symbolName ?? params.entityId,
			targetId:      target.id,
			totalCallers:  callers.length,
			returned:      hits.length,
			ambiguous:     ambiguousCandidates,
		},
		'usage.example: complete',
	);

	return {
		type:            'usage.example',
		subject:         params.symbolName ?? target.name,
		targetEntityId:  target.id,
		callers:         hits,
		totalCallers:    callers.length,
	};
}

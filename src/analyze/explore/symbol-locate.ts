/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * symbol.locate exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 1. Given one or
 * more symbol names, look up every entity that matches -- exact or
 * substring, configurable. Repo-scoped by
 * ExplorationRunnerContext.repoPath.
 *
 * Backing: findEntitiesByName (multi-name variant with repo filter)
 * + a substring-scan fallback when exact match returns nothing.
 * Both paths are deterministic.
 */

import { getDb } from '../../db/client.js';
import { findEntitiesByName, listEntitiesForRepo } from '../../db/entities.js';
import { getLogger } from '../../shared/logger.js';
import type { Entity, EntityKind } from '../../shared/types.js';

import type {
	Exploration,
	ExplorationRunnerContext,
	SymbolHit,
	SymbolLocateOutput,
} from './types.js';

const log = getLogger('analyze:explore:symbol-locate');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const DEFAULT_KINDS: readonly EntityKind[] = [
	'function', 'method', 'class', 'interface', 'type', 'variable', 'module',
];

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface SymbolLocateParams {
	readonly names:        readonly string[];
	readonly kinds?:       readonly EntityKind[];
	readonly limit?:       number;
	readonly matchMode?:   'exact' | 'substring';
}

function parseParams(exp: Exploration): SymbolLocateParams {
	const p = exp.params as Record<string, unknown>;
	const namesRaw = p['names'];
	if (!Array.isArray(namesRaw) || namesRaw.length === 0) {
		throw new Error('symbol.locate: params.names is required (non-empty string[])');
	}
	const names = namesRaw
		.filter(n => typeof n === 'string')
		.map(n => (n as string).trim())
		.filter(n => n.length >= 2);
	if (names.length === 0) {
		throw new Error('symbol.locate: params.names contained no valid entries');
	}
	const kindsRaw = p['kinds'];
	const kinds = Array.isArray(kindsRaw)
		? kindsRaw.filter(k => typeof k === 'string') as EntityKind[]
		: undefined;
	const limit = typeof p['limit'] === 'number' && p['limit']! > 0
		? Math.min(MAX_LIMIT, Math.floor(p['limit'] as number))
		: DEFAULT_LIMIT;
	const matchMode = p['matchMode'] === 'substring' ? 'substring' : 'exact';
	return {
		names,
		kinds: kinds ?? DEFAULT_KINDS,
		limit,
		matchMode,
	};
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runSymbolLocate(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<SymbolLocateOutput> {
	const params = parseParams(exp);
	const db = await getDb();

	// Exact match first -- indexed by name, O(K) where K = matches.
	let matched: Entity[] = [];
	if (params.matchMode === 'exact') {
		matched = await findEntitiesByName(db, params.names, {
			repo:  ctx.repoPath,
			kinds: params.kinds!,
		});
	}

	// Substring fallback (or the requested match mode). Walks every
	// entity in the repo + does a case-insensitive substring match.
	// Not cheap on a large repo (~50-100k entities) but still <1s.
	if (matched.length === 0 || params.matchMode === 'substring') {
		const all = await listEntitiesForRepo(db, ctx.repoPath);
		const lcNames = params.names.map(n => n.toLowerCase());
		const kindSet = new Set<string>(params.kinds!);
		const substringMatches: Entity[] = [];
		for (const e of all) {
			if (!kindSet.has(e.kind)) continue;
			if (e.artifact === true) continue;
			const lcName = e.name.toLowerCase();
			for (const q of lcNames) {
				if (lcName.includes(q)) {
					substringMatches.push(e);
					break;
				}
			}
		}
		if (matched.length === 0) matched = substringMatches;
		else matched = mergeUnique(matched, substringMatches);
	}

	// Drop stale entities under gitignored paths (out/, build/, dist/,
	// ...). Otherwise a symbol defined in src/ shows up twice -- once
	// from source, once from its compiled JS twin -- and the outer LLM
	// cites the compiled file as if it were canonical.
	matched = matched.filter(e => ctx.ignoreFilter.isIncluded(e.file));

	// Cap + sort deterministically (by file:line for stable output).
	matched.sort((a, b) => {
		if (a.file !== b.file) return a.file.localeCompare(b.file);
		return a.startLine - b.startLine;
	});
	const capped = matched.slice(0, params.limit ?? DEFAULT_LIMIT);

	const hits: SymbolHit[] = capped.map(e => ({
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
			runId:       ctx.runId,
			names:       params.names,
			matchMode:   params.matchMode,
			returned:    hits.length,
			totalMatched: matched.length,
		},
		'symbol.locate: complete',
	);

	return {
		type:  'symbol.locate',
		names: params.names,
		hits,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeUnique(a: readonly Entity[], b: readonly Entity[]): Entity[] {
	const seen = new Set<string>();
	const out: Entity[] = [];
	for (const list of [a, b]) {
		for (const e of list) {
			if (seen.has(e.id)) continue;
			seen.add(e.id);
			out.push(e);
		}
	}
	return out;
}

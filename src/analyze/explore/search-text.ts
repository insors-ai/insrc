/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * search.text exploration runner.
 *
 * plans/exploration-based-context-build.md Phase 3.1. Given a regex
 * pattern, grep the repo for text-level matches. Fills the gap the
 * live Test 4 exposed: string-literal rules (model ids, config
 * keys, env-var names) don't surface via symbol.locate because the
 * literals aren't entity names. The synthesizer promotes hits from
 * this exploration into `## Matches` / `## Drifts` under the same
 * citation contract as symbol.locate.
 *
 * Backing: `runGrepSearch` in daemon/tools/builtins/search/grep.ts
 * -- the same primitive that powers the search_grep built-in tool.
 * One code path, two consumers. Uses ripgrep when available with a
 * Node fallback baked in.
 */

import { getLogger } from '../../shared/logger.js';
import { runGrepSearch } from '../../daemon/tools/builtins/search/grep.js';

import type {
	Exploration,
	ExplorationRunnerContext,
	SearchTextHit,
	SearchTextOutput,
} from './types.js';

const log = getLogger('analyze:explore:search-text');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K = 30;
const MAX_TOP_K     = 200;

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface SearchTextParams {
	readonly pattern:         string;
	readonly glob?:           string;
	readonly caseInsensitive?: boolean;
	readonly topK?:           number;
	/** When provided, search under this subpath rather than the repo
	 *  root. Must be inside `ctx.repoPath` (checked at run-time). */
	readonly path?:           string;
}

function parseParams(exp: Exploration): SearchTextParams {
	const p = exp.params as Record<string, unknown>;
	const pattern = typeof p['pattern'] === 'string' ? (p['pattern'] as string).trim() : '';
	if (pattern.length === 0) {
		throw new Error('search.text: params.pattern is required (non-empty regex string)');
	}
	const glob = typeof p['glob'] === 'string' && (p['glob'] as string).length > 0
		? (p['glob'] as string)
		: undefined;
	const caseInsensitive = p['caseInsensitive'] === true;
	const topK = typeof p['topK'] === 'number' && p['topK']! > 0
		? Math.min(MAX_TOP_K, Math.floor(p['topK'] as number))
		: DEFAULT_TOP_K;
	const path = typeof p['path'] === 'string' && (p['path'] as string).length > 0
		? (p['path'] as string)
		: undefined;
	return {
		pattern,
		...(glob !== undefined ? { glob } : {}),
		caseInsensitive,
		topK,
		...(path !== undefined ? { path } : {}),
	};
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export async function runSearchText(
	exp: Exploration,
	ctx: ExplorationRunnerContext,
): Promise<SearchTextOutput> {
	const params = parseParams(exp);

	// Scope check: if the caller passed an explicit `path`, it must
	// be inside ctx.repoPath. Prevents a stray decomposer plan from
	// grepping outside the closure.
	const root = params.path !== undefined
		? resolveScopedPath(params.path, ctx.repoPath)
		: ctx.repoPath;

	let data;
	try {
		data = await runGrepSearch({
			pattern:         params.pattern,
			root,
			...(params.glob !== undefined ? { glob: params.glob } : {}),
			caseInsensitive: params.caseInsensitive === true,
			limit:           params.topK ?? DEFAULT_TOP_K,
		});
	} catch (err) {
		log.warn(
			{ runId: ctx.runId, pattern: params.pattern, err: (err as Error).message },
			'search.text: grep failed; returning empty output',
		);
		return {
			type:      'search.text',
			pattern:   params.pattern,
			hits:      [],
			truncated: false,
			backend:   'node',
			root,
		};
	}

	const hits: SearchTextHit[] = data.hits.map(h => ({
		// Grep returns paths relative to `root`; make absolute so
		// citations survive without a per-hit root reminder.
		file: h.path.startsWith('/') ? h.path : `${root}/${h.path}`,
		line: h.line,
		text: h.text,
	}));

	log.info(
		{
			runId:           ctx.runId,
			pattern:         params.pattern,
			glob:            params.glob ?? '(none)',
			caseInsensitive: params.caseInsensitive === true,
			root,
			backend:         data.usedRipgrep ? 'ripgrep' : 'node',
			hits:            hits.length,
			truncated:       data.truncated,
		},
		'search.text: complete',
	);

	return {
		type:      'search.text',
		pattern:   params.pattern,
		hits,
		truncated: data.truncated,
		backend:   data.usedRipgrep ? 'ripgrep' : 'node',
		root:      data.root,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Enforce that `candidate` resolves to a path inside `repoRoot`.
 * Uses simple prefix comparison after normalising trailing slashes;
 * decomposer plans never pass `..` in the wild but we defend anyway.
 */
function resolveScopedPath(candidate: string, repoRoot: string): string {
	const normRoot = repoRoot.replace(/\/+$/, '');
	// If the caller supplied a repo-relative segment, prepend the
	// repo root. Otherwise validate the absolute path is under the
	// root.
	if (!candidate.startsWith('/')) {
		return `${normRoot}/${candidate.replace(/^\/+/, '')}`;
	}
	const norm = candidate.replace(/\/+$/, '');
	if (norm === normRoot || norm.startsWith(`${normRoot}/`)) {
		return norm;
	}
	throw new Error(
		`search.text: params.path='${candidate}' is not inside repoPath='${repoRoot}'`,
	);
}

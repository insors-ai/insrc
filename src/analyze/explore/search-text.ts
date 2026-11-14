import { captureAnalysisDiagnostics } from '../connection-access.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * search.text exploration runner.
 *
 * docs/plans/exploration-based-context-build.md Phase 3.1. Given a regex
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
import { GrepIncompleteError, runGrepSearch } from '../../daemon/tools/builtins/search/grep.js';
import type { GrepSearchOptions, SearchGrepData } from '../../daemon/tools/builtins/search/grep.js';

import { textSearchCompleteness } from './completeness-facts.js';
import { LookupFailedError } from './lookup-failed.js';

import type {
	Exploration,
	ExplorationRunnerContext,
	SearchTextHit,
	SearchTextOutput,
} from './types.js';

const log = getLogger('analyze:explore:search-text');

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface SearchTextParams {
	readonly pattern:         string;
	readonly glob?:           string;
	readonly caseInsensitive?: boolean;
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
	const path = typeof p['path'] === 'string' && (p['path'] as string).length > 0
		? (p['path'] as string)
		: undefined;
	return {
		pattern,
		...(glob !== undefined ? { glob } : {}),
		caseInsensitive,
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

	// A search that could not run throws, and the executor reports the lookup as
	// failed. It does not return an empty result: that would read as "nothing matches".
	const data = await runCompleteSearch('search.text', {
		pattern:         params.pattern,
		root,
		...(params.glob !== undefined ? { glob: params.glob } : {}),
		caseInsensitive: params.caseInsensitive === true,
	});

	const hits: SearchTextHit[] = data.hits.map(h => ({
		// Grep returns paths relative to `root`; make absolute so
		// citations survive without a per-hit root reminder.
		file: h.path.startsWith('/') ? h.path : `${root}/${h.path}`,
		line: h.line,
		text: h.text,
	}));

	captureAnalysisDiagnostics(log, ctx.connectionExecution).emit('info', () => [{
			runId:           ctx.runId,
			pattern:         params.pattern,
			glob:            params.glob ?? '(none)',
			caseInsensitive: params.caseInsensitive === true,
			root,
			backend:         data.usedRipgrep ? 'ripgrep' : 'node',
			hits:            hits.length,
	}, 'search.text: complete']);

	return {
		type:      'search.text',
		completeness: textSearchCompleteness(data),
		pattern:   params.pattern,
		hits,
		backend:   data.usedRipgrep ? 'ripgrep' : 'node',
		root:      data.root,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * The analyzer's text search: every hit with its whole line. A search that runs
 * past its deadline or whose ripgrep fails is the failed lookup, carrying the
 * hits gathered; it is never returned as a result, empty or complete.
 */
export async function runCompleteSearch(lookup: string, opts: Omit<GrepSearchOptions, 'complete'>): Promise<SearchGrepData> {
	try {
		return await runGrepSearch({ ...opts, complete: true });
	} catch (err) {
		if (err instanceof GrepIncompleteError) {
			throw new LookupFailedError(
				`${lookup}: the search did not finish: ${err.message}`,
				err.hits.map(h => ({ source: `${h.path}:${h.line}`, content: h.text })),
				{ cause: err },
			);
		}
		throw err;
	}
}

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

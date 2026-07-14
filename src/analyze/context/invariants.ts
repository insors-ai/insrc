/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Pre-LLM-call invariants for the analyze Context Builder shaper.
 *
 * Currently a single invariant: a run-mode invocation against an
 * unindexed scope produces a useless bundle (no entities = no graph
 * data = the LLM falls back to filesystem scanning, which is shallow
 * and slow). We detect the empty-closure condition upfront, surface
 * a typed error, and let the orchestrator decide whether to abort
 * the run or trigger an indexer pass.
 *
 * The design's "auto-reindex on empty closure" wiring is NOT
 * implemented here -- triggering a real reindex pass requires
 * instantiating the IndexerService (queue + watcher + embedder),
 * which today lives entirely inside the daemon main process. Wiring
 * the analyze framework to enqueue index jobs through the daemon's
 * existing queue belongs in a separate task (P6.b / framework
 * outer-loop). For now we throw ScopeNotIndexedError with a
 * descriptive message so the user (or a future orchestrator)
 * knows what to do.
 *
 * Skipped invocation modes:
 *   - classification: target-agnostic; works off filesystem signals
 *     even without an indexed graph.
 *   - task: by the time a task fires, the run-mode invocation has
 *     already passed this check.
 *
 * See: design/analyze-context-builder.md "Failure modes"
 *      plans/analyze-context-builder.md Phase 6
 */

import { listEntitiesForRepo } from '../../db/entities.js';
import { listRepos } from '../../db/repos.js';
import { getLogger } from '../../shared/logger.js';
import type { RegisteredRepo } from '../../shared/types.js';

import type { ClassifiedIntent } from './types.js';

const log = getLogger('analyze:context:invariants');

export class ScopeNotIndexedError extends Error {
	readonly scopePath:    string;
	readonly registeredAs: string | undefined;

	constructor(scopePath: string, registeredAs: string | undefined, reason: string) {
		super(
			`Scope ${scopePath} produced an empty graph closure. ` +
				(registeredAs !== undefined
					? `Registered repo: ${registeredAs}. `
					: 'No registered repo contains this path. ') +
				`Reason: ${reason}. ` +
				`Run \`insrc repo add <path>\` and let the indexer finish ` +
				`(status: 'ready') before re-running analyze.`,
		);
		this.name = 'ScopeNotIndexedError';
		this.scopePath = scopePath;
		this.registeredAs = registeredAs;
	}
}

/**
 * Ensure the intent's scope has a non-empty graph closure -- i.e.
 * there is at least one indexed entity for the repo containing
 * `intent.scopeRef.value`.
 *
 * Resolves the containing repo via longest-prefix match against
 * `listRepos`. Skips silently for `scopeRef.kind === 'connection'`
 * (data-only scopes don't depend on the code graph).
 *
 * Throws ScopeNotIndexedError when:
 *   - scope path is filesystem-y AND no registered repo contains it
 *   - the matching repo's status is 'pending' / 'indexing' / 'error'
 *     and zero entities have been written for it (the indexer never
 *     reached the upsert step)
 *   - the matching repo's status is 'ready' but its entity count is
 *     still zero (an indexer bug / stale state -- surface loudly)
 *
 * On success, returns the path of the matching repo (or undefined
 * for connection-only scopes) so the caller can record it for
 * telemetry.
 */
export async function ensureNonEmptyClosure(
	intent: ClassifiedIntent,
): Promise<string | undefined> {
	const ref = intent.scopeRef;

	// Data-only scopes don't need a code graph.
	if (ref.kind === 'connection') {
		log.debug({ scope: ref.value }, 'ensureNonEmptyClosure: skipping connection-kind scope');
		return undefined;
	}

	const scopePath = scopePathFor(ref);
	if (scopePath.length === 0) {
		// Empty or non-filesystem scope; nothing we can check.
		return undefined;
	}

	// Find the longest-prefix registered repo containing the scope.
	let repos: readonly RegisteredRepo[];
	try {
		repos = await listRepos(null);
	} catch (err) {
		// Registry unreachable (e.g. graph store not initialised in a
		// test harness). We do NOT throw ScopeNotIndexedError here --
		// the invariant cannot evaluate its precondition. The driver
		// proceeds; downstream tools that need graph data will either
		// fall back or fail with their own errors.
		log.debug(
			{ scope: scopePath, err: (err as Error).message },
			'ensureNonEmptyClosure: registry read failed; skipping invariant',
		);
		return undefined;
	}

	// Pristine registry: no repos registered at all. Most likely a
	// test harness or a first-time user who hasn't run `insrc repo
	// add` yet. We cannot meaningfully enforce the invariant in this
	// state (there's no expected closure to compare against), so we
	// skip silently and let the shaper fall back to filesystem tools.
	if (repos.length === 0) {
		log.debug(
			{ scope: scopePath },
			'ensureNonEmptyClosure: registry pristine; skipping invariant',
		);
		return undefined;
	}

	let best: RegisteredRepo | undefined;
	for (const r of repos) {
		const isPrefix = scopePath === r.path || scopePath.startsWith(`${r.path}/`);
		if (!isPrefix) continue;
		if (best === undefined || r.path.length > best.path.length) {
			best = r;
		}
	}

	if (best === undefined) {
		throw new ScopeNotIndexedError(
			scopePath,
			undefined,
			'no registered repo contains the scope path',
		);
	}

	// Count entities indexed for this repo. Stops at the first hit;
	// no need to materialise the full list.
	const entities = await listEntitiesForRepo(null, best.path);
	if (entities.length === 0) {
		throw new ScopeNotIndexedError(
			scopePath,
			best.path,
			`registered repo has zero indexed entities (status: ${best.status})`,
		);
	}

	log.debug(
		{ scope: scopePath, repo: best.path, entityCount: entities.length },
		'ensureNonEmptyClosure: closure non-empty',
	);
	return best.path;
}

/**
 * Same path-extraction shape as the driver's `inferScopePath`, but
 * limited to this module to avoid the import cycle.
 */
function scopePathFor(ref: ClassifiedIntent['scopeRef']): string {
	if (ref.kind === 'connection') return '';
	return ref.value;
}

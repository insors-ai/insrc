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
 *      docs/plans/analyze-context-builder.md Phase 6
 */

import { listEntitiesForRepo } from '../../db/entities.js';
import { listRepos } from '../../db/repos.js';
import { getLogger } from '../../shared/logger.js';
import type { RegisteredRepo } from '../../shared/types.js';

import { freshnessPathOf } from './scope.js';
import type { ResolvedScope, ScopeDeps } from './scope.js';

const log = getLogger('analyze:context:invariants');

/** A scope's value does not resolve: a symbol with no entity (or
 *  several) of that name, a connection registered in no repo (or in
 *  several), a value in the wrong form. */
export class ScopeRefUnresolvedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ScopeRefUnresolvedError';
	}
}

/** A kind of scope that does not go with a kind of source. */
export class ScopeKindTargetMismatchError extends Error {
	constructor(kind: string, target: string, allowed: readonly string[]) {
		super(
			`scopeRef.kind='${kind}' is incompatible with target='${target}'. ` +
				`Allowed kinds for this target: ${allowed.join(', ')}.`,
		);
		this.name = 'ScopeKindTargetMismatchError';
	}
}

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

/** A task under a connection scope names a connection other than the scope's
 *  own. Only a task is refused this way: the request's own scope is in order. */
export class ConnectionOutsideScopeError extends Error {
	constructor(templateLabel: string, scopeConnectionId: string, named: string) {
		super(
			`${templateLabel}: the request's scope is the connection '${scopeConnectionId}', ` +
				`and this task names the connection '${named}'. A task under a connection scope works on that connection only.`,
		);
		this.name = 'ConnectionOutsideScopeError';
	}
}

/** The code of each of the three scope errors, as a request's failure states it. */
export type ScopeErrorCode = 'scope-not-indexed' | 'scope-ref-unresolved' | 'scope-ref-kind-target-mismatch';

/** A scope error as a coded failure. `scope-not-indexed` carries the path that
 *  was looked for and the repo it was found registered as, if any. */
export type ScopeErrorMapping =
	| { readonly code: 'scope-not-indexed'; readonly message: string; readonly data: { readonly scopePath: string; readonly registeredAs: string | undefined } }
	| { readonly code: 'scope-ref-unresolved' | 'scope-ref-kind-target-mismatch'; readonly message: string };

/**
 * The ONE mapping from the three scope error classes to their codes. Returns
 * `undefined` for any other error.
 *
 * It lives beside the classes so that everything that turns one of them into a
 * coded failure can call it without importing each other: the plan tree's
 * mapping (orchestrator/driver.ts), the daemon's (daemon/analyze-rpc.ts), and
 * the plan walk (through `taskRefusalMapping`), which the run driver itself
 * imports.
 */
export function scopeErrorMapping(err: unknown): ScopeErrorMapping | undefined {
	if (err instanceof ScopeNotIndexedError) {
		return { code: 'scope-not-indexed', message: err.message, data: { scopePath: err.scopePath, registeredAs: err.registeredAs } };
	}
	if (err instanceof ScopeRefUnresolvedError) return { code: 'scope-ref-unresolved', message: err.message };
	if (err instanceof ScopeKindTargetMismatchError) return { code: 'scope-ref-kind-target-mismatch', message: err.message };
	return undefined;
}

/** The code a refused task carries: one of the three scope codes, or the code
 *  of a task that names a connection outside the request's connection scope. */
export type TaskRefusalCode = ScopeErrorCode | 'connection-outside-scope';

/**
 * The ONE mapping from an error a task was refused with to its code: the three
 * scope errors (through `scopeErrorMapping`) and the connection refusal, which
 * no request fails with and so is not a `ScopeErrorCode`. Returns `undefined`
 * for any other error. The plan walk records a task's failure through it.
 */
export function taskRefusalMapping(err: unknown): { readonly code: TaskRefusalCode; readonly message: string } | undefined {
	if (err instanceof ConnectionOutsideScopeError) return { code: 'connection-outside-scope', message: err.message };
	const scoped = scopeErrorMapping(err);
	return scoped !== undefined ? { code: scoped.code, message: scoped.message } : undefined;
}

/**
 * Ensure the scope has a non-empty graph closure -- i.e. there is
 * at least one indexed entity for the repo containing the scope's
 * path.
 *
 * Resolves the containing repo via longest-prefix match against
 * `listRepos`. Skips silently for a connection scope
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
 *
 * `deps` holds the two readers the check uses. A caller that resolved
 * the scope through its own readers passes the same ones, so one call
 * resolves and checks against the same registry; given none the check
 * reads the real store.
 */
export async function ensureNonEmptyClosure(
	scope: ResolvedScope,
	deps?: Pick<ScopeDeps, 'listRepos' | 'listEntitiesForRepo'>,
): Promise<string | undefined> {
	// Data-only scopes don't need a code graph.
	if (scope.kind === 'connection') {
		log.debug({ scope: scope.value }, 'ensureNonEmptyClosure: skipping connection-kind scope');
		return undefined;
	}

	const scopePath = freshnessPathOf(scope);
	if (scopePath.length === 0) {
		// Empty or non-filesystem scope; nothing we can check.
		return undefined;
	}

	// Find the longest-prefix registered repo containing the scope.
	let repos: readonly RegisteredRepo[];
	try {
		repos = deps !== undefined ? await deps.listRepos() : await listRepos(null);
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
	const entities = deps !== undefined
		? await deps.listEntitiesForRepo(best.path)
		: await listEntitiesForRepo(null, best.path);
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

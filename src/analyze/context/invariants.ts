import { captureAnalysisDiagnostics } from '../connection-access.js';
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
import { readIndexRun } from '../../indexer/run-record.js';
import type { IndexRunView } from '../../indexer/run-record.js';

import { freshnessPathOf, longestPrefixRepo } from './scope.js';
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

/** How far the run of a repository under index got, as far as it is known. */
export type RepoIndexingRun = {
	/** Unix ms. */
	readonly startedAt?:     number | undefined;
	/** Unix ms; a run that ended. */
	readonly endedAt?:       number | undefined;
	/** Absent before the walk has counted the files. */
	readonly filesSelected?: number | undefined;
	readonly filesDone?:     number | undefined;
	readonly error?:         string | undefined;
};

/** What a 'repo-indexing' failure carries. `run` is null when the figures are not known. */
export type RepoIndexingData = {
	readonly repoPath: string;
	readonly status:   'indexing' | 'error';
	readonly run:      RepoIndexingRun | null;
};

/**
 * The scope's repository is being indexed, or its last index ended in an
 * error before it completed: a request about it would be answered from a
 * half-built index, so it is refused, saying how far the run got.
 */
export class RepoIndexingError extends Error {
	readonly data: RepoIndexingData;

	constructor(data: RepoIndexingData) {
		super(repoIndexingMessage(data));
		this.name = 'RepoIndexingError';
		this.data = data;
	}
}

function at(ms: number | undefined): string {
	return ms === undefined ? 'an unknown time' : new Date(ms).toISOString();
}

function repoIndexingMessage(d: RepoIndexingData): string {
	const run = d.run;
	if (d.status === 'indexing') {
		if (run === null) {
			return `The repository ${d.repoPath} is being indexed; how far the run has got is not known yet. ` +
				'Retry once the index is ready.';
		}
		const files = run.filesSelected === undefined
			? 'the files to index are not yet counted'
			: `${run.filesDone ?? 0} of ${run.filesSelected} files done`;
		return `The repository ${d.repoPath} is being indexed: the run began at ${at(run.startedAt)}, ${files}. ` +
			'Retry once the index is ready.';
	}
	const error = run?.error !== undefined && run.error !== '' ? ` Error: ${run.error}` : '';
	if (run === null || run.startedAt === undefined) {
		return `The last index of the repository ${d.repoPath} ended in an error before it completed; ` +
			`how far it got is not known.${error} Re-index the repository.`;
	}
	return `The last index of the repository ${d.repoPath} ended in an error before it completed: ` +
		`it began at ${at(run.startedAt)}, ended at ${at(run.endedAt)}, ${run.filesDone ?? 0} of ${run.filesSelected ?? 0} files done.` +
		`${error} Re-index the repository.`;
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

/** The code of each of the scope errors, as a request's failure states it. */
export type ScopeErrorCode = 'scope-not-indexed' | 'scope-ref-unresolved' | 'scope-ref-kind-target-mismatch' | 'repo-indexing';

/** A scope error as a coded failure. `scope-not-indexed` carries the path that
 *  was looked for and the repo it was found registered as, if any. */
export type ScopeErrorMapping =
	| { readonly code: 'scope-not-indexed'; readonly message: string; readonly data: { readonly scopePath: string; readonly registeredAs: string | undefined } }
	| { readonly code: 'repo-indexing'; readonly message: string; readonly data: RepoIndexingData }
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
	if (err instanceof RepoIndexingError) return { code: 'repo-indexing', message: err.message, data: err.data };
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
	deps?: Pick<ScopeDeps, 'listRepos' | 'listEntitiesForRepo'> & { readonly indexRun?: ((repoPath: string) => IndexRunView | undefined) | undefined },
): Promise<string | undefined> {
	// Data-only scopes don't need a code graph.
	if (scope.kind === 'connection') {
		captureAnalysisDiagnostics(log).emit('debug', () => [{ scope: scope.value }, 'ensureNonEmptyClosure: skipping connection-kind scope']);
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
		captureAnalysisDiagnostics(log).emit('debug', () => [{ scope: scopePath, err: (err as Error).message }, 'ensureNonEmptyClosure: registry read failed; skipping invariant']);
		return undefined;
	}

	// Pristine registry: no repos registered at all. Most likely a
	// test harness or a first-time user who hasn't run `insrc repo
	// add` yet. We cannot meaningfully enforce the invariant in this
	// state (there's no expected closure to compare against), so we
	// skip silently and let the shaper fall back to filesystem tools.
	if (repos.length === 0) {
		captureAnalysisDiagnostics(log).emit('debug', () => [{ scope: scopePath }, 'ensureNonEmptyClosure: registry pristine; skipping invariant']);
		return undefined;
	}

	const best = longestPrefixRepo(scopePath, repos);
	// A repository under index is refused first, with how far its run got,
	// before its entity count is read: a half-built index is not an answer.
	if (best !== undefined) refuseIfUnderIndex(best, deps?.indexRun);
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

	captureAnalysisDiagnostics(log).emit('debug', () => [{ scope: scopePath, repo: best.path, entityCount: entities.length }, 'ensureNonEmptyClosure: closure non-empty']);
	return best.path;
}


/**
 * Refuse a scope whose repository is being indexed, or whose last index ended
 * in an error before it completed, with RepoIndexingError: the status, and how
 * far the run got (from the daemon's running record while it runs, from the
 * row's lastRun once it ended). Runs for every kind of source; a connection
 * scope reads no repository's index and is not checked.
 *
 * It does not refuse, and does not throw, when it cannot tell: the registry
 * cannot be read, holds no repository at all, or holds none that contains the
 * scope (that refusal is the empty-closure check's, for the sources that read
 * the graph). The request then proceeds as it does today.
 */
export async function ensureRepoQueryable(
	scope: ResolvedScope,
	deps?: {
		readonly listRepos?: (() => Promise<readonly RegisteredRepo[]>) | undefined;
		readonly indexRun?:  ((repoPath: string) => IndexRunView | undefined) | undefined;
	},
): Promise<void> {
	if (scope.kind === 'connection') return;
	const scopePath = freshnessPathOf(scope);
	if (scopePath.length === 0) return;

	let repos: readonly RegisteredRepo[];
	try {
		repos = deps?.listRepos !== undefined ? await deps.listRepos() : await listRepos(null);
	} catch (err) {
		captureAnalysisDiagnostics(log).emit('debug', () => [{ scope: scopePath, err: (err as Error).message }, 'ensureRepoQueryable: registry read failed; skipping the check']);
		return;
	}
	if (repos.length === 0) {
		captureAnalysisDiagnostics(log).emit('debug', () => [{ scope: scopePath }, 'ensureRepoQueryable: registry pristine; skipping the check']);
		return;
	}
	const repo = longestPrefixRepo(scopePath, repos);
	if (repo === undefined) return;
	refuseIfUnderIndex(repo, deps?.indexRun);
}

/**
 * Whether a registered repository is under index: being indexed, or its last
 * index ended in an error before it completed. The ONE statement of the rule:
 * the refusal below and the search requests' result filtering
 * (src/daemon/search-guard.ts underIndexFilter) both read it.
 */
export function isUnderIndex(repo: Pick<RegisteredRepo, 'status'>): boolean {
	return repo.status === 'indexing' || repo.status === 'error';
}

/** The rule itself, for a repository already found in the registry. */
function refuseIfUnderIndex(
	repo:     RegisteredRepo,
	indexRun: ((repoPath: string) => IndexRunView | undefined) | undefined,
): void {
	if (!isUnderIndex(repo)) return;
	if (repo.status === 'indexing') {
		const view = (indexRun ?? readIndexRun)(repo.path);
		throw new RepoIndexingError({
			repoPath: repo.path,
			status:   'indexing',
			run:      view === undefined ? null : {
				startedAt: view.startedAt,
				...(view.filesSelected !== undefined ? { filesSelected: view.filesSelected } : {}),
				filesDone: view.filesDone,
			},
		});
	}
	if (repo.status === 'error') {
		const last = repo.lastRun;
		const error = last?.error ?? repo.errorMsg;
		throw new RepoIndexingError({
			repoPath: repo.path,
			status:   'error',
			// A row written before lastRun was recorded is a failed run whose figures are not known.
			run: last !== undefined && last.outcome === 'failed'
				? { startedAt: last.startedAt, endedAt: last.endedAt, filesSelected: last.filesSelected, filesDone: last.filesDone, ...(error !== undefined ? { error } : {}) }
				: (error !== undefined && error !== '' ? { error } : null),
		});
	}
}

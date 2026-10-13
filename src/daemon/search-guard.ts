/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The guard of the daemon's graph-reading search requests and built-in graph
 * tools (Epic c2ba6fa6, Story s5): a request that names a repository being
 * indexed, or whose last index ended in an error before it completed, is
 * refused rather than answered from a half-built index.
 *
 * A request names its repositories by path, by a file, by an entity (whose
 * stored repository is read), or by a list of entities (any one under index
 * refuses the request). The rule and its wording are the analyzer's own
 * (ensureRepoQueryable); a registry that cannot be read, or holds no
 * repository, is not refused.
 *
 * Over the request socket an error is a string, so the refusal starts with its
 * code: 'repo-indexing: <the analyzer's message>'.
 */

import { getEntity } from '../db/entities.js';
import { listRepos } from '../db/repos.js';
import { ensureRepoQueryable, isUnderIndex, RepoIndexingError } from '../analyze/context/invariants.js';
import type { IndexRunView } from '../indexer/run-record.js';
import { getLogger } from '../shared/logger.js';
import type { RegisteredRepo } from '../shared/types.js';

const log = getLogger('search-guard');

/** What a request names its repositories by. */
export interface SearchRequestNames {
	readonly repoPaths?: readonly (string | undefined)[] | undefined;
	readonly filePaths?: readonly (string | undefined)[] | undefined;
	readonly entityIds?: readonly (string | undefined)[] | undefined;
}

/** Test seam: the readers the guard uses (defaults: the store and the daemon's running record). */
export interface SearchGuardDeps {
	readonly listRepos?: (() => Promise<readonly RegisteredRepo[]>) | undefined;
	readonly indexRun?:  ((repoPath: string) => IndexRunView | undefined) | undefined;
	readonly entityRepo?: ((entityId: string) => Promise<string | undefined>) | undefined;
}

/** The error a refused search request answers with: its message starts with the code. */
export class SearchRefusedError extends Error {
	readonly refusal: RepoIndexingError;
	constructor(refusal: RepoIndexingError) {
		super(`repo-indexing: ${refusal.message}`);
		this.name = 'SearchRefusedError';
		this.refusal = refusal;
	}
}

async function storedRepoOf(entityId: string): Promise<string | undefined> {
	const e = await getEntity(null, entityId);
	return e?.repo !== undefined && e.repo !== '' ? e.repo : undefined;
}

/**
 * Refuse with SearchRefusedError when any repository the request names is
 * under index; resolve otherwise (an entity that is not stored names nothing).
 */
export async function guardSearchRequest(names: SearchRequestNames, deps: SearchGuardDeps = {}): Promise<void> {
	const paths = new Set<string>();
	for (const p of [...(names.repoPaths ?? []), ...(names.filePaths ?? [])]) {
		if (typeof p === 'string' && p !== '') paths.add(p);
	}
	const entityRepo = deps.entityRepo ?? storedRepoOf;
	for (const id of names.entityIds ?? []) {
		if (typeof id !== 'string' || id === '') continue;
		let repo: string | undefined;
		try {
			repo = await entityRepo(id);
		} catch (err) {
			// A store read that fails names nothing, as a registry read that fails
			// refuses nothing: the request is answered as before the guard existed.
			log.debug({ entityId: id, err: (err as Error).message }, 'guardSearchRequest: entity read failed; not guarded by it');
			continue;
		}
		if (repo !== undefined) paths.add(repo);
	}
	for (const path of paths) {
		try {
			await ensureRepoQueryable({ kind: 'repo', value: path, repoPath: path, lookupPath: path }, {
				...(deps.listRepos !== undefined ? { listRepos: deps.listRepos } : {}),
				...(deps.indexRun !== undefined ? { indexRun: deps.indexRun } : {}),
			});
		} catch (err) {
			if (err instanceof RepoIndexingError) throw new SearchRefusedError(err);
			throw err;
		}
	}
}

/**
 * What a result that follows the graph or a closure across repositories leaves
 * out: the entities and the repositories of every repository under index (the
 * guard's rule: being indexed, or last index ended in an error). Built from one
 * registry read; a registry that cannot be read leaves nothing out, as the
 * guard refuses nothing then.
 */
export interface UnderIndexFilter {
	/** The repositories left out. */
	readonly repos: ReadonlySet<string>;
	entities<T extends { readonly repo?: string | undefined }>(rows: readonly T[]): T[];
	paths(paths: readonly string[]): string[];
}

export async function underIndexFilter(deps: Pick<SearchGuardDeps, 'listRepos'> = {}): Promise<UnderIndexFilter> {
	let registered: readonly RegisteredRepo[];
	try {
		registered = deps.listRepos !== undefined ? await deps.listRepos() : await listRepos(null);
	} catch (err) {
		// The guard refuses nothing then, so the filter leaves nothing out.
		log.debug({ err: (err as Error).message }, 'underIndexFilter: registry read failed; nothing left out');
		registered = [];
	}
	const repos = new Set(registered.filter(isUnderIndex).map(r => r.path));
	return {
		repos,
		entities: rows => rows.filter(e => e.repo === undefined || !repos.has(e.repo)),
		paths: paths => paths.filter(p => !repos.has(p)),
	};
}

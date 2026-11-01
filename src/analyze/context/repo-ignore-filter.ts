/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `RepoIgnoreFilter` -- the analyze framework's view of which paths in a repo
 * are "real source" vs "build artefacts / dependencies / ignored trash".
 *
 * Since Epic c2ba6fa6 s6 it is a thin wrapper over the indexer's FileFilter,
 * the one rule for what the index holds: the repository's real ignore files
 * (nested .gitignore files, the clone's exclude file, the global gitignore),
 * git's tracked files always included, and the built-in exclusions
 * (generated or minified files, .git, .insrc). The exploration runners that
 * walk the filesystem therefore see exactly what the indexer indexes.
 *
 * ## Non-git repos
 *
 * A folder that is not a git repository gets the ignore-file rules alone
 * (s6 ac9) -- no longer a permissive "include everything" fallback.
 * `gitBacked` says whether `repoPath/.git` exists.
 *
 * ## Directory semantics
 *
 * A directory is "included" iff at least one included file lives under it
 * (FileFilter.includes' own directory answer); the repository root always is.
 * A path that is not on disk is not included.
 *
 * ## Lifetime
 *
 * One filter per `executePlan` call. All runners in that plan share it via
 * `ExplorationRunnerContext.ignoreFilter`.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { createFileFilter } from '../../indexer/file-filter.js';
import { captureAnalysisDiagnostics } from '../connection-access.js';
import { getLogger } from '../../shared/logger.js';

const log = getLogger('analyze:repo-ignore-filter');

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface RepoIgnoreFilter {
	/**
	 * True if `absPath` is an included file OR a directory holding one
	 * (the repository root always). False for a path the repository's
	 * ignore rules or the built-in exclusions leave out.
	 */
	isIncluded(absPath: string): boolean;

	/**
	 * Filter an array of absolute paths, keeping only the ones the
	 * filter considers included. Sugar over `.filter(isIncluded)`.
	 */
	include<T extends { readonly path: string }>(items: readonly T[]): T[];

	/** Repo path this filter was built for. */
	readonly repoPath: string;

	/** True when `repoPath` is a git repository (`repoPath/.git` exists). */
	readonly gitBacked: boolean;
}

/** The analyze view of `repoPath`'s FileFilter (Epic c2ba6fa6 s6). */
export function createRepoIgnoreFilter(repoPath: string): RepoIgnoreFilter {
	const absRepo = resolve(repoPath);
	const filter = createFileFilter(absRepo);
	// A path not on disk is not included: `git ls-files`, which this filter
	// replaced, never listed one, and a runner asking about a stored entity's
	// file must not take a deleted file for real source.
	const isIncluded = (absPath: string): boolean => resolve(absPath) === absRepo || (existsSync(absPath) && filter.includes(absPath));
	const gitBacked = existsSync(join(absRepo, '.git'));
	captureAnalysisDiagnostics(log).emit('debug', () => [{ repo: absRepo, gitBacked }, 'repo ignore filter ready']);
	return {
		repoPath: absRepo,
		gitBacked,
		isIncluded,
		include<T extends { readonly path: string }>(items: readonly T[]): T[] {
			return items.filter(i => isIncluded(i.path));
		},
	};
}

// ---------------------------------------------------------------------------
// Permissive fallback
// ---------------------------------------------------------------------------

function permissiveFilter(repoPath: string): RepoIgnoreFilter {
	return {
		repoPath,
		gitBacked: false,
		isIncluded()          { return true; },
		include<T>(items: readonly T[]): T[] { return items.slice(); },
	};
}

/**
 * Test / non-git-repo helper. Returns a filter that considers every
 * path included. Use in unit tests when you don't want gitignore
 * semantics leaking into the assertion.
 */
export function permissiveIgnoreFilter(repoPath = ''): RepoIgnoreFilter {
	return permissiveFilter(repoPath);
}

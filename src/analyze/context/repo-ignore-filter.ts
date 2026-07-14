/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `RepoIgnoreFilter` -- the analyze framework's authoritative view
 * of which paths in a repo are "real source" vs "build artefacts /
 * dependencies / gitignored trash".
 *
 * ## Why this exists
 *
 * The indexer already excludes gitignored files via
 * `git ls-files --exclude-standard` (see indexer/index.ts). But the
 * runtime exploration recipes (module.profile, concept.resolve,
 * convention.detect, manifests.locate, class.hierarchy) walk the
 * filesystem directly via readdirSync and only consult ad-hoc
 * IGNORE_DIRS sets. Those sets miss anything not baked in --
 * concept.resolve for example lists `dist`, `build`, `target`,
 * `.next` but not `out/`, which is how the compiled output of a
 * VSCode-style repo leaks into every structural-map bundle.
 *
 * Rather than curate more ignore lists per exploration, delegate to
 * git. This filter runs `git ls-files --cached --others
 * --exclude-standard -z` once per plan execution and reports which
 * absolute paths git considers tracked-or-uncommitted-and-not-
 * ignored. Every FS-walking exploration filters through it.
 *
 * ## Non-git repos
 *
 * `git ls-files` fails outside a git repo. In that case the filter
 * degrades to permissive: every path is considered tracked, and the
 * exploration falls back to its own IGNORE_DIRS set. This matches
 * how the indexer degrades for non-git repos.
 *
 * ## Directory semantics
 *
 * `git ls-files` returns FILES only. For directory queries
 * (readdirSync yields a mix of files and subdirs), the filter also
 * tracks the ancestor directories of tracked files: a directory is
 * "included" iff at least one tracked file lives under it. That
 * matches gitignore semantics -- a gitignored directory has no
 * tracked descendants.
 *
 * ## Lifetime
 *
 * One filter per `executePlan` call. All runners in that plan share
 * it via `ExplorationRunnerContext.ignoreFilter`. Not cached across
 * plans (would need a repo-mtime invalidation story; not worth the
 * complexity for a single-digit-ms subprocess call).
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { getLogger } from '../../shared/logger.js';

const log = getLogger('analyze:repo-ignore-filter');

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface RepoIgnoreFilter {
	/**
	 * True if `absPath` is a tracked file OR an ancestor directory of
	 * one. False if git considers the path gitignored. For non-git
	 * repos or when git ls-files failed, always returns true (the
	 * filter degrades to permissive so downstream IGNORE_DIRS sets
	 * still filter).
	 */
	isIncluded(absPath: string): boolean;

	/**
	 * Filter an array of absolute paths, keeping only the ones the
	 * filter considers included. Sugar over `.filter(isIncluded)`.
	 */
	include<T extends { readonly path: string }>(items: readonly T[]): T[];

	/** Repo path this filter was built for. */
	readonly repoPath: string;

	/**
	 * True when git returned a real answer. False when we fell back
	 * to permissive (non-git repo, git binary missing, git call
	 * threw). Callers can log this once for observability.
	 */
	readonly gitBacked: boolean;
}

/**
 * Build a filter for `repoPath` by asking git which files are
 * tracked / uncommitted-but-not-ignored. One subprocess call; the
 * filter caches the result for the lifetime of the returned object.
 */
export function createRepoIgnoreFilter(repoPath: string): RepoIgnoreFilter {
	const absRepo = resolve(repoPath);
	if (!existsSync(join(absRepo, '.git'))) {
		log.debug({ repo: absRepo }, 'not a git repo; using permissive filter');
		return permissiveFilter(absRepo);
	}

	let files: string[];
	try {
		// Same flags the indexer uses. --cached: tracked; --others: not
		// tracked but not ignored either (fresh files); --exclude-
		// standard: honour .gitignore + .git/info/exclude + global
		// gitignore. -z: NUL-separated to survive filenames with
		// newlines (rare but not impossible).
		const stdout = execFileSync(
			'git',
			['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
			{ cwd: absRepo, maxBuffer: 50 * 1024 * 1024, encoding: 'utf8' },
		);
		files = stdout.split('\0').filter(Boolean);
	} catch (err) {
		log.warn(
			{ repo: absRepo, err: String(err) },
			'git ls-files failed; degrading to permissive filter',
		);
		return permissiveFilter(absRepo);
	}

	const trackedFiles = new Set<string>();
	const trackedDirs = new Set<string>();
	trackedDirs.add(absRepo);
	for (const relFile of files) {
		const abs = resolve(absRepo, relFile);
		trackedFiles.add(abs);
		// Add every ancestor dir up to (but not past) the repo root
		// so a query for "is this DIRECTORY included?" answers true
		// when the dir has at least one tracked descendant.
		let dir = dirname(abs);
		while (dir.length >= absRepo.length && dir !== absRepo) {
			if (trackedDirs.has(dir)) break;
			trackedDirs.add(dir);
			const parent = dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
	}

	log.debug(
		{ repo: absRepo, files: trackedFiles.size, dirs: trackedDirs.size },
		'repo ignore filter ready',
	);

	return {
		repoPath:  absRepo,
		gitBacked: true,
		isIncluded(absPath: string): boolean {
			const abs = resolve(absPath);
			return trackedFiles.has(abs) || trackedDirs.has(abs);
		},
		include<T extends { readonly path: string }>(items: readonly T[]): T[] {
			return items.filter(i => trackedFiles.has(resolve(i.path)) || trackedDirs.has(resolve(i.path)));
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

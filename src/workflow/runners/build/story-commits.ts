/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Story's OWN changes since its range base (ISSUE-f9ced66a, LLD-f9ced66a-s1,
 * task t4).
 *
 * The range base is fixed when the build starts, so an upstream merge made
 * mid-build sits inside `base..HEAD`. Diffing that range would review the
 * merged-in code as the Story's work. {@link storyChangeSet} instead lists the
 * Story's change units on the first-parent line:
 *
 *   - `commit`     — each non-merge commit, against its parent;
 *   - `merge-edit` — each merge whose committed tree differs from the clean
 *                    auto-merge of its parents (`git merge-tree --write-tree`):
 *                    exactly what was edited INSIDE the merge commit, i.e. Story
 *                    edits folded in or a hand-resolved conflict.
 *
 * Read-only: `merge-tree --write-tree` writes objects only, never refs, the
 * index or the working tree. No exclusions are applied here; consumers keep
 * excluding through git (`git_diff`'s `exclude`).
 *
 * Story attribution (ISSUE-b47dadc7): given a story key (`<epicHash>/<storyId>`),
 * a non-merge commit is a unit only when its message carries the trailer
 * `Insrc-Story: <storyKey>`, so another Story's commits on main in the same
 * window are left out. When no commit in the range carries it, or the trailers
 * cannot be read, the units are the first-parent ones above.
 *
 * Known limits: without the trailer, upstream brought in by a fast-forward or by
 * a committed `git merge --squash` leaves only ordinary commits on the
 * first-parent line, so those commits are counted as Story work. Merge edits are
 * kept whatever the trailer says, and an octopus merge is reviewed over its
 * whole change.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { getLogger } from '../../../shared/logger.js';
import { NoBuildChangesError } from './changed-files.js';

const log = getLogger('workflow:build:story-commits');

export interface StoryChangeUnit {
	readonly kind:  'commit' | 'merge-edit';
	/** The commit (or merge commit) this unit belongs to. */
	readonly ref:   string;
	/** Diff endpoints: `from..to` is exactly this unit's change. */
	readonly from:  string;
	readonly to:    string;
	readonly paths: readonly string[];
}

export interface StoryChangeSet {
	/** Sorted union of every unit's paths. */
	readonly paths:       readonly string[];
	/** The Story's units, oldest first along the first-parent line. */
	readonly units:       readonly StoryChangeUnit[];
	/** Story paths a merge's merged-in side also changed. */
	readonly sharedPaths: readonly string[];
	/** Paths edited inside a merge commit. */
	readonly foldedPaths: readonly string[];
}

/** How the units were chosen: by the Story's commit trailer, or every first-parent commit. */
export type StoryAttribution = 'story-trailer' | 'first-parent-range';

export interface AttributedStoryChangeSet extends StoryChangeSet {
	readonly attribution:        StoryAttribution;
	/** Story paths that a commit left out by the trailer also changed (empty for 'first-parent-range'). */
	readonly sharedWithExcluded: readonly string[];
}

/** The trailer every build commit of a Story carries (ISSUE-b47dadc7). */
export const STORY_TRAILER_KEY = 'Insrc-Story';

const MAX_BUFFER = 64 * 1024 * 1024;

/** Run git and return stdout; exit codes in `okCodes` (besides 0) are not failures. */
function git(repoPath: string, args: readonly string[], okCodes: readonly number[] = []): string {
	try {
		return execFileSync('git', args, { cwd: repoPath, encoding: 'utf8', maxBuffer: MAX_BUFFER, stdio: ['ignore', 'pipe', 'pipe'] });
	} catch (err) {
		const e = err as { status?: number | null; stdout?: string; stderr?: string; message?: string };
		if (typeof e.status === 'number' && okCodes.includes(e.status) && typeof e.stdout === 'string') return e.stdout;
		throw new NoBuildChangesError(`git ${args.join(' ')} failed in ${repoPath}: ${(e.stderr ?? e.message ?? String(err)).trim()}`);
	}
}

/** NUL-separated path output (`-z`) to a list. */
function zPaths(out: string): string[] {
	return out.split('\0').filter(p => p.length > 0);
}

interface TrailerScan {
	/** Commits whose message carries the Story's trailer. */
	readonly carrying: ReadonlySet<string>;
	/** Each commit's subject line, for the missed-commit warning. */
	readonly subjects: ReadonlyMap<string, string>;
	/** Abbreviated sha of the newest carrying commit on the first-parent line. */
	readonly newest:   string | undefined;
}

/** The first-parent commits in the range that carry `Insrc-Story: <storyKey>`;
 *  undefined when the trailers cannot be read. */
function scanTrailers(repoPath: string, base: string, storyKey: string): TrailerScan | undefined {
	let out: string;
	try {
		out = git(repoPath, ['log', '--first-parent', `--format=%H%x1f%h%x1f%s%x1f%(trailers:key=${STORY_TRAILER_KEY},valueonly,separator=%x1f)%x1e`, `${base}..HEAD`]);
	} catch (err) {
		log.warn({ repoPath, storyKey, err: err instanceof Error ? err.message : String(err) }, 'storyChangeSet: could not read commit trailers; using the first-parent range');
		return undefined;
	}
	const carrying = new Set<string>();
	const subjects = new Map<string, string>();
	let newest: string | undefined;
	// git log lists newest first, so the first carrying commit is the newest.
	for (const record of out.split('\x1e')) {
		const [sha, short, subject, ...values] = record.trim().split('\x1f');
		if (sha === undefined || sha.length === 0) continue;
		subjects.set(sha, subject ?? '');
		if (values.some(v => v.trim() === storyKey)) {
			carrying.add(sha);
			newest ??= short;
		}
	}
	return { carrying, subjects, newest };
}

/** The abbreviated sha of the newest first-parent commit since `base` carrying
 *  `Insrc-Story: <storyKey>`; undefined when none does or the trailers cannot
 *  be read. Never throws. */
export function newestStoryCommit(repoPath: string, base: string, storyKey: string): string | undefined {
	return scanTrailers(repoPath, base, storyKey)?.newest;
}

/**
 * The Story's own change units since `base` — see the module comment. Throws
 * {@link NoBuildChangesError} when git fails (for example, an unresolvable base).
 */
export function storyChangeSet(repoPath: string, base: string, opts: { readonly storyKey?: string | undefined } = {}): AttributedStoryChangeSet {
	// Each line: "<commit> <parent>..." along the first-parent line, oldest first.
	const lines = git(repoPath, ['rev-list', '--first-parent', '--reverse', '--parents', `${base}..HEAD`])
		.split('\n').map(l => l.trim()).filter(l => l.length > 0);

	const { storyKey } = opts;
	const scan = storyKey !== undefined ? scanTrailers(repoPath, base, storyKey) : undefined;
	const byTrailer = scan !== undefined && scan.carrying.size > 0;
	const storyId = storyKey?.split('/')[1];
	const excludedPaths = new Set<string>();

	let emptyTree: string | undefined;
	const units: StoryChangeUnit[] = [];
	const mergedIn = new Set<string>();

	for (const line of lines) {
		const [ref, ...parents] = line.split(' ');
		if (ref === undefined) continue;

		if (parents.length <= 1) {
			const parent = parents[0];
			const from = parent ?? (emptyTree ??= git(repoPath, ['hash-object', '-t', 'tree', '/dev/null']).trim());
			const paths = zPaths(git(repoPath, ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--root', ref]));
			if (byTrailer && !scan.carrying.has(ref)) {
				for (const p of paths) excludedPaths.add(p);
				const subject = scan.subjects.get(ref) ?? '';
				if (storyId !== undefined && subject.includes(`(build): ${storyId}/`)) {
					log.warn({ repoPath, storyKey, commit: ref, subject }, 'storyChangeSet: a commit names this Story but lacks its trailer; left out of the change set');
				}
				continue;
			}
			if (paths.length > 0) units.push({ kind: 'commit', ref, from, to: ref, paths });
			continue;
		}

		const [first, second] = parents as [string, string, ...string[]];
		if (parents.length > 2) {
			// merge-tree cannot compute an octopus auto-merge: review the whole
			// change rather than drop anything.
			const paths = zPaths(git(repoPath, ['diff', '--name-only', '-z', first, ref]));
			log.warn({ repoPath, merge: ref, parents: parents.length }, 'storyChangeSet: octopus merge reviewed over its whole change');
			if (paths.length > 0) units.push({ kind: 'merge-edit', ref, from: first, to: ref, paths });
			continue;
		}

		// Exit 1 is a conflicted auto-merge: its tree (with conflict markers) is
		// still the first line, and the hand resolution is then a merge edit.
		const auto = git(repoPath, ['merge-tree', '--write-tree', first, second], [1]).split('\n')[0]?.trim() ?? '';
		if (auto.length === 0) throw new NoBuildChangesError(`git merge-tree printed no tree for ${ref} in ${repoPath}`);
		for (const p of zPaths(git(repoPath, ['diff', '--name-only', '-z', first, auto]))) mergedIn.add(p);
		const edited = zPaths(git(repoPath, ['diff', '--name-only', '-z', auto, ref]));
		if (edited.length > 0) units.push({ kind: 'merge-edit', ref, from: auto, to: ref, paths: edited });
	}

	const paths = [...new Set(units.flatMap(u => u.paths))].sort();
	return {
		paths,
		units,
		sharedPaths: paths.filter(p => mergedIn.has(p)),
		foldedPaths: [...new Set(units.filter(u => u.kind === 'merge-edit').flatMap(u => u.paths))].sort(),
		attribution: byTrailer ? 'story-trailer' : 'first-parent-range',
		sharedWithExcluded: paths.filter(p => excludedPaths.has(p)),
	};
}

/**
 * True while a merge has been started and not committed: MERGE_HEAD exists, or
 * an uncommitted `git merge --squash` left SQUASH_MSG. Any other git failure is
 * logged and reads as false, so this check never blocks a build on its own.
 */
export function mergeInProgress(repoPath: string): boolean {
	try {
		execFileSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: repoPath, stdio: 'ignore' });
		return true;
	} catch (err) {
		if ((err as { status?: number | null }).status !== 1) {
			log.warn({ repoPath, err: err instanceof Error ? err.message : String(err) }, 'mergeInProgress: could not check MERGE_HEAD');
			return false;
		}
	}
	try {
		const rel = execFileSync('git', ['rev-parse', '--git-path', 'SQUASH_MSG'], { cwd: repoPath, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
		return existsSync(isAbsolute(rel) ? rel : join(repoPath, rel));
	} catch (err) {
		log.warn({ repoPath, err: err instanceof Error ? err.message : String(err) }, 'mergeInProgress: could not locate SQUASH_MSG');
		return false;
	}
}

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
 * Story attribution (ISSUE-b47dadc7, ISSUE-b97752e9): given a story key
 * (`<epicHash>/<storyId>`), one rule covers every first-parent commit, ordinary,
 * merge or octopus:
 *   - a commit whose Insrc-Story lines all name OTHER Stories (a foreign commit)
 *     is never a unit; its paths count as excluded;
 *   - a commit carrying `Insrc-Story: <storyKey>` is a unit;
 *   - an untrailered merge is a unit (merge edits are Story work unless they
 *     say otherwise); an untrailered ordinary commit is a unit only when no
 *     commit in the range carries the Story's trailer (a Story built before
 *     the trailer).
 * When the trailers cannot be read, the lenient scan falls back to the
 * first-parent units above; with `strict` it throws instead, so an anchored
 * caller is never widened by a git failure.
 *
 * Known limits: without the trailer, upstream brought in by a fast-forward or by
 * a committed `git merge --squash` leaves only ordinary commits on the
 * first-parent line, so those commits are counted as Story work. An octopus
 * merge is reviewed over its whole change.
 */

import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { gitDiffTool } from '../../../daemon/tools/builtins/git/diff.js';
import { gitDiffTreeTool } from '../../../daemon/tools/builtins/git/diff-tree.js';
import { gitHashObjectTool } from '../../../daemon/tools/builtins/git/hash-object.js';
import { gitLogTool } from '../../../daemon/tools/builtins/git/log.js';
import { gitMergeTreeTool } from '../../../daemon/tools/builtins/git/merge-tree.js';
import { gitRevListTool } from '../../../daemon/tools/builtins/git/rev-list.js';
import { getLogger } from '../../../shared/logger.js';
import { catFileExists, gitCall, GitCallFailed, LOCAL_GIT_TIMEOUT_MS, revParse, revParseValues } from '../../git-calls.js';
import type { GitCallOptions } from '../../git-calls.js';
import { NoBuildChangesError } from './changed-files.js';
import { resolveStoryRangeEnd } from './range-base.js';

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
	/** Story paths that a commit left out by the trailer also changed. */
	readonly sharedWithExcluded: readonly string[];
	/** True when the units were chosen from the range (trailer units, or a range a
	 *  foreign commit was left out of): each unit must then be read on its own,
	 *  since the net `base..HEAD` diff carries the left-out commits' changes. False
	 *  only for an unfiltered first-parent range. */
	readonly perUnit:            boolean;
}

/** The trailer every build commit of a Story carries (ISSUE-b47dadc7). */
export const STORY_TRAILER_KEY = 'Insrc-Story';

/** The time one git call of the change-set derivation may take. */
const GIT_MS = 60_000;

/** The most commits one `git_log` call returns; a range of this many is read as unreadable rather than cut short. */
const LOG_LIMIT = 500;

/** Make one git call over the tool registry; an ordinary failure is a {@link NoBuildChangesError}, a denial is thrown as it is. */
async function viaTools<T>(repoPath: string, what: string, run: (o: GitCallOptions) => Promise<T>): Promise<T> {
	try { return await run({ timeoutMs: GIT_MS }); }
	catch (err) {
		if (err instanceof GitCallFailed) throw new NoBuildChangesError(`git ${what} failed in ${repoPath}: ${err.message.trim()}`);
		throw err;
	}
}

/** The names of the paths a diff between two trees or commits lists (`git diff --name-only`). */
const diffPaths = async (repoPath: string, from: string, to: string): Promise<string[]> =>
	(await viaTools(repoPath, `diff --name-only ${from} ${to}`, o => gitCall(gitDiffTool, { from, to }, repoPath, o))).files.map(f => f.path);

interface TrailerScan {
	/** Commits whose message carries the Story's trailer. */
	readonly carrying: ReadonlySet<string>;
	/** Commits whose Insrc-Story lines all name other Stories. */
	readonly foreign:  ReadonlySet<string>;
	/** Each commit's subject line, for the missed-commit warning. */
	readonly subjects: ReadonlyMap<string, string>;
	/** Abbreviated sha of the newest carrying commit on the first-parent line. */
	readonly newest:   string | undefined;
}

/** The first-parent commits in the range that carry `Insrc-Story: <storyKey>`,
 *  and those that carry only other Stories' lines; undefined when the messages
 *  cannot be read, or a throw with `strict`. The line counts in any paragraph
 *  of the message: git's trailer parser reads only the last paragraph, so a Story
 *  line followed by a blank line and a co-author block would be missed
 *  (ISSUE-f431a442). It must be a whole line of that form; a mention inside
 *  other text does not count. */
async function scanTrailers(repoPath: string, base: string, storyKey: string, strict = false): Promise<TrailerScan | undefined> {
	let commits: readonly { sha: string; shortSha: string; subject: string; body: string }[];
	try {
		commits = (await viaTools(repoPath, `log --first-parent ${base}..HEAD`, o => gitCall(gitLogTool, { ref: `${base}..HEAD`, firstParent: true, limit: LOG_LIMIT }, repoPath, o))).commits;
		if (commits.length >= LOG_LIMIT) throw new NoBuildChangesError(`git log ${base}..HEAD in ${repoPath} lists ${LOG_LIMIT} commits or more: the range is too long to read the trailers of`);
	} catch (err) {
		if (!(err instanceof NoBuildChangesError)) throw err;   // a denied call ends the derivation
		if (strict) throw err;
		log.warn({ repoPath, storyKey, err: err instanceof Error ? err.message : String(err) }, 'storyChangeSet: could not read commit trailers; using the first-parent range');
		return undefined;
	}
	const carrying = new Set<string>();
	const foreign = new Set<string>();
	const subjects = new Map<string, string>();
	let newest: string | undefined;
	// git log lists newest first, so the first carrying commit is the newest.
	for (const { sha, shortSha: short, subject, body } of commits) {
		if (sha.length === 0) continue;
		subjects.set(sha, subject);
		const keys = storyLines(`${subject}\n${body}`);
		if (keys.includes(storyKey)) {
			carrying.add(sha);
			newest ??= short;
		} else if (keys.length > 0) {
			foreign.add(sha);
		}
	}
	return { carrying, foreign, subjects, newest };
}

/** The keys of every whole `Insrc-Story: <key>` line in a commit message. */
export function storyLines(message: string): string[] {
	const prefix = `${STORY_TRAILER_KEY}:`;
	return message.split('\n')
		.map(l => l.trim())
		.filter(l => l.startsWith(prefix))
		.map(l => l.slice(prefix.length).trim());
}

/** The abbreviated sha of the newest first-parent commit since `base` carrying
 *  `Insrc-Story: <storyKey>`; undefined when none does or the trailers cannot
 *  be read. Never throws. */
export async function newestStoryCommit(repoPath: string, base: string, storyKey: string): Promise<string | undefined> {
	return (await scanTrailers(repoPath, base, storyKey))?.newest;
}

/**
 * The Story's own change units since `base` — see the module comment. Throws
 * {@link NoBuildChangesError} when git fails (for example, an unresolvable base),
 * and with `strict` also when the commit messages cannot be read.
 */
export async function storyChangeSet(repoPath: string, base: string, opts: { readonly storyKey?: string | undefined; readonly strict?: boolean | undefined } = {}): Promise<AttributedStoryChangeSet> {
	// Each line: "<commit> <parent>..." along the first-parent line, oldest first.
	const listed = await viaTools(repoPath, `rev-list --first-parent --reverse --parents ${base}..HEAD`, o => gitCall(gitRevListTool, { rev: `${base}..HEAD`, firstParent: true, parents: true }, repoPath, o));
	if (!('commits' in listed)) throw new NoBuildChangesError(`git rev-list ${base}..HEAD in ${repoPath} answered a count`);
	const lines = listed.commits.map((ref, i) => [ref, ...(listed.parents?.[i] ?? [])].join(' ')).reverse();

	const { storyKey } = opts;
	const scan = storyKey !== undefined ? await scanTrailers(repoPath, base, storyKey, opts.strict === true) : undefined;
	const byTrailer = scan !== undefined && scan.carrying.size > 0;
	const [epicHash, storyId] = storyKey?.split('/') ?? [];
	// A pre-trailer Story's range ends at its recorded build commit (ISSUE-b97752e9):
	// the commits after it are later work, not the Story's. An end equal to the base
	// means nothing committed yet; one off the first-parent line is ignored.
	const afterEnd = new Set<string>();
	if (scan !== undefined && !byTrailer && epicHash !== undefined && storyId !== undefined) {
		const end = await resolveStoryRangeEnd(repoPath, epicHash, storyId);
		if (end !== undefined) {
			const refs = lines.map(l => l.split(' ')[0] ?? '');
			const at = refs.indexOf(end);
			if (at >= 0) {
				for (const r of refs.slice(at + 1)) afterEnd.add(r);
			} else if (end === (await viaTools(repoPath, `rev-parse --verify ${base}^{commit}`, o => revParse(repoPath, `${base}^{commit}`, { verify: true }, o))).trim()) {
				for (const r of refs) afterEnd.add(r);
			} else {
				log.warn({ repoPath, storyKey, end }, 'storyChangeSet: the recorded build commit is not on the range\'s first-parent line; the range runs to HEAD');
			}
		}
	}
	// Left out: another Story's commit, or a commit after a pre-trailer Story's end.
	const foreign = (ref: string): boolean => scan?.foreign.has(ref) === true || afterEnd.has(ref);
	let leftOutForeign = false;
	const excludedPaths = new Set<string>();

	let emptyTree: string | undefined;
	const units: StoryChangeUnit[] = [];
	const mergedIn = new Set<string>();

	for (const line of lines) {
		const [ref, ...parents] = line.split(' ');
		if (ref === undefined) continue;

		if (parents.length <= 1) {
			const parent = parents[0];
			const from = parent ?? (emptyTree ??= (await viaTools(repoPath, 'hash-object -t tree /dev/null', o => gitCall(gitHashObjectTool, { path: '/dev/null', type: 'tree' }, repoPath, o))).sha.trim());
			const paths = (await viaTools(repoPath, `diff-tree --root ${ref}`, o => gitCall(gitDiffTreeTool, { rev: ref, root: true }, repoPath, o))).paths;
			if (foreign(ref) || (byTrailer && !scan.carrying.has(ref))) {
				for (const p of paths) excludedPaths.add(p);
				if (foreign(ref)) leftOutForeign = true;
				const subject = scan?.subjects.get(ref) ?? '';
				// Only an untrailered commit can be this Story's missing a trailer.
				if (!foreign(ref) && storyId !== undefined && subject.includes(`(build): ${storyId}/`)) {
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
			const paths = await diffPaths(repoPath, first, ref);
			if (foreign(ref)) {
				for (const p of paths) excludedPaths.add(p);
				leftOutForeign = true;
				continue;
			}
			log.warn({ repoPath, merge: ref, parents: parents.length }, 'storyChangeSet: octopus merge reviewed over its whole change');
			if (paths.length > 0) units.push({ kind: 'merge-edit', ref, from: first, to: ref, paths });
			continue;
		}

		// Exit 1 is a conflicted auto-merge: its tree (with conflict markers) is
		// still the first line, and the hand resolution is then a merge edit.
		const auto = (await viaTools(repoPath, `merge-tree --write-tree ${first} ${second}`, o => gitCall(gitMergeTreeTool, { a: first, b: second }, repoPath, o))).tree.trim();
		if (auto.length === 0) throw new NoBuildChangesError(`git merge-tree printed no tree for ${ref} in ${repoPath}`);
		for (const p of await diffPaths(repoPath, first, auto)) mergedIn.add(p);
		const edited = await diffPaths(repoPath, auto, ref);
		if (foreign(ref)) {
			for (const p of edited) excludedPaths.add(p);
			leftOutForeign = true;
			continue;
		}
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
		perUnit: byTrailer || leftOutForeign,
	};
}

/**
 * True while a merge has been started and not committed: MERGE_HEAD exists, or
 * an uncommitted `git merge --squash` left SQUASH_MSG. Any other git failure is
 * logged and reads as false, so this check never blocks a build on its own.
 */
export async function mergeInProgress(repoPath: string): Promise<boolean> {
	try {
		if (await catFileExists(repoPath, 'MERGE_HEAD', { timeoutMs: LOCAL_GIT_TIMEOUT_MS })) return true;
	} catch (err) {
		if (!(err instanceof GitCallFailed)) throw err;
		log.warn({ repoPath, err: err.message }, 'mergeInProgress: could not check MERGE_HEAD');
		return false;
	}
	try {
		const rel = (await revParseValues(repoPath, { gitPath: 'SQUASH_MSG' }, { timeoutMs: LOCAL_GIT_TIMEOUT_MS }))[0]?.trim() ?? '';
		return rel.length > 0 && existsSync(isAbsolute(rel) ? rel : join(repoPath, rel));
	} catch (err) {
		if (!(err instanceof GitCallFailed)) throw err;
		log.warn({ repoPath, err: err.message }, 'mergeInProgress: could not locate SQUASH_MSG');
		return false;
	}
}

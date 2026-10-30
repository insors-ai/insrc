/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S002 (provenance/feedback) t2 — the shared git changed-file seam.
 *
 * `changedFiles(repoPath)` is the EXTRACTED body of the code-review resolver's
 * former `realChangedFiles` (code-review/subject.ts) — moved here verbatim so the
 * BUILD runner can derive its changed set WITHOUT importing the code-review
 * module. `code-review/subject.ts` re-points its `DEFAULT_DEPS.changedFiles` at
 * this helper and re-exports `NoBuildChangesError`, so its behaviour (and tests)
 * are unchanged.
 *
 * `collectBuildChangeLog` maps that changed set into a file-level {@link FileChangeLog}
 * for the BUILD ledger record (S002 t3). It SWALLOWS a git derivation failure and
 * returns `[]` — a build must never fail because the change-log could not be
 * collected.
 */

import { isAbsolute, relative } from 'node:path';

import { gitDiffTool } from '../../../daemon/tools/builtins/git/diff.js';
import type { GitDiffData } from '../../../daemon/tools/builtins/git/diff.js';
import type { ToolDeps } from '../../../daemon/tools/types.js';
import { getLogger } from '../../../shared/logger.js';
import type { FileChangeLog, FileChangeEntry } from '../../artifacts/provenance/types.js';
import { storyChangeSet } from './story-commits.js';
import type { StoryAttribution } from './story-commits.js';

const log = getLogger('workflow:build:changed-files');

/** Raised by the git seam that cannot derive a changed-file set (e.g. not a git
 *  repository / git failed). The code-review resolver maps it to
 *  `reason:'no-build-record'`; `collectBuildChangeLog` swallows it to `[]`. */
export class NoBuildChangesError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NoBuildChangesError';
	}
}

/**
 * The workflow's OWN ledger files, as repo-root globs in git's glob-pathspec
 * dialect (`*` stops at a directory separator, `**` does not).
 *
 * These are records ABOUT the work — artifact JSON and JSONL histories, the build-start stamps, and
 * the rendered documents — not the work itself, so a code review leaves them out.
 * The artifact globs are deliberately flat: `.insrc/artifacts/templates/` and
 * `.insrc/artifacts/formats/` hold USER-authored files that a Story may change
 * and that must stay reviewable, as must `.insrc/templates|feedback|conventions`.
 *
 * Passed to git (see {@link ChangedFilesOptions.excludeGlobs}) rather than
 * matched here, so there is one implementation of the glob semantics — git's.
 */
export const LEDGER_EXCLUDE_GLOBS: readonly string[] = Object.freeze([
	'.insrc/artifacts/*.json',
	'.insrc/artifacts/*.jsonl',
	'.insrc/build-start/**',
	'docs/epics/**',
	'docs/standalone/**',
]);

/** Additive options for {@link changedFiles}. Every field is OPTIONAL and the
 *  derivation is bit-for-bit unchanged when none is supplied, so every
 *  existing single-argument call site keeps its current result. */
export interface ChangedFilesOptions {
	/** Start of the Story's COMMITTED range. With it, the Story's commits decide the
	 *  set, whatever the working tree holds (ISSUE-b97752e9): an uncommitted change
	 *  counts only when it edits a file those commits changed, and every other one is
	 *  reported as excludedUncommitted. Without it, the working-tree derivation, for
	 *  callers that do not know a Story. */
	readonly base?: string | undefined;
	/** Paths to drop from the derived set, whatever derivation produced them.
	 *  Accepts repo-ABSOLUTE or repo-RELATIVE entries — callers hold absolute paths
	 *  (buildArtifactPaths returns them) while git reports relative ones, so
	 *  normalising here keeps every caller from having to remember. Applied to the
	 *  UNION, so an exclusion can never be half-applied to one derivation. */
	readonly exclude?: readonly string[] | undefined;
	/** Globs git itself leaves out of EVERY diff this derivation runs (unstaged,
	 *  staged and range), forwarded as `git_diff`'s `exclude`. Unlike `exclude`,
	 *  which filters the reported paths here, these never reach the diff at all —
	 *  so a tree dirty only with matching files is clean for the emptiness gate. */
	readonly excludeGlobs?: readonly string[] | undefined;
	/** `<epicHash>/<storyId>` (ISSUE-b47dadc7): keeps only the Story's own commits
	 *  (see {@link storyChangeSet}, read with `strict`). A storyKey without a base is
	 *  refused: a Story's set has no anchor, and the working tree is not its scope. */
	readonly storyKey?: string | undefined;
	/** Told how the returned set was scoped: the working tree, or the committed
	 *  range by trailer or by first-parent commits, with the Story paths another
	 *  Story's excluded commit also changed and the uncommitted paths left out. */
	readonly onAttribution?: ((a: ChangeSetAttributionReport) => void) | undefined;
}

/** How {@link changedFiles} scoped its result (ISSUE-b47dadc7). */
export interface ChangeSetAttributionReport {
	readonly attribution:        StoryAttribution | 'working-tree';
	readonly sharedWithExcluded: readonly string[];
	/** Uncommitted paths (unstaged or staged) left out because none of the Story's
	 *  commits changed them, sorted. Empty for the working-tree derivation. */
	readonly excludedUncommitted: readonly string[];
}

/** Run one `git_diff` and collect its changed paths into `into`. */
async function collectDiff(
	repoPath: string,
	input: Readonly<Record<string, unknown>>,
	into: Set<string>,
): Promise<void> {
	const toolDeps: ToolDeps = { sessionId: 'code-review', repoPath, send: () => {}, requestId: 0 };
	const res = await gitDiffTool.execute({ cwd: repoPath, ...input }, toolDeps);
	if (!res.success) {
		throw new NoBuildChangesError(`git_diff failed for ${repoPath}: ${res.error ?? res.output}`);
	}
	const data = res.data as GitDiffData | undefined;
	if (!data) throw new NoBuildChangesError(`git_diff returned no data for ${repoPath}`);
	for (const f of data.files) into.add(f.path);
}

/**
 * The changed-file set, via the `git_diff` builtin. Read-only; throws
 * `NoBuildChangesError` on git failure.
 *
 * With `opts.base`, the Story's commits since the base decide the set
 * (ISSUE-b97752e9): their units are read first, then the working tree
 * (unstaged ∪ staged), whose paths count only when a Story commit already
 * changed them. Every other uncommitted path is reported, never returned, so the
 * result never depends on what else the tree holds. Without a base, the
 * working-tree diff, for callers that do not know a Story.
 */
export async function changedFiles(repoPath: string, opts?: ChangedFilesOptions): Promise<readonly string[]> {
	// ONE filter, applied to BOTH derivations through this single closure. The
	// exclusion must not be applied per-derivation by duplicated code: dropping the
	// record's own paths from the working-tree set but not the range set (or vice
	// versa) is the exact half-fix shape this Story is closing.
	const drop = new Set((opts?.exclude ?? []).map(e => toRepoRelative(repoPath, e)));
	const keep = (found: ReadonlySet<string>): string[] => [...found].filter(f => !drop.has(f));
	// Spread onto every diff below from this ONE value, for the same reason as the
	// closure above: a glob applied to the working-tree diffs but not the range
	// would be a half-applied exclusion. Absent or empty, the key is not sent at
	// all, so the tool's input is exactly what it was before the option existed.
	const globs = opts?.excludeGlobs !== undefined && opts.excludeGlobs.length > 0
		? { exclude: [...opts.excludeGlobs] }
		: {};
	const base = opts?.base !== undefined && opts.base.length > 0 ? opts.base : undefined;
	if (base === undefined && opts?.storyKey !== undefined) {
		throw new NoBuildChangesError(`no range base for Story ${opts.storyKey} in ${repoPath}: its change set has no anchor`);
	}

	const working = new Set<string>();
	const readWorking = async (): Promise<void> => {
		for (const staged of [false, true]) await collectDiff(repoPath, { staged, ...globs }, working);
	};

	if (base === undefined) {
		await readWorking();
		opts?.onAttribution?.({ attribution: 'working-tree', sharedWithExcluded: [], excludedUncommitted: [] });
		return keep(working);
	}

	// The Story's commits first. With a storyKey the trailer scan is strict: a
	// failed read must refuse, not widen the set to the whole first-parent range.
	const set = storyChangeSet(repoPath, base, { storyKey: opts?.storyKey, ...(opts?.storyKey !== undefined ? { strict: true } : {}) });
	const ranged = new Set<string>();
	if (set.perUnit) {
		// Each kept unit's own diff (ISSUE-b47dadc7), not the net range: a file this
		// Story changed and another Story later restored is still this Story's, and a
		// left-out commit's change to a shared file never shows. The exclusions stay
		// with git.
		for (const u of set.units) await collectDiff(repoPath, { from: u.from, to: u.to, ...globs }, ranged);
	} else {
		await collectDiff(repoPath, { from: base, ...globs }, ranged);
		// Only the Story's OWN changes count (ISSUE-f9ced66a): a file a mid-build
		// merge brought in is in base..HEAD but in none of the Story's units. The
		// exclusions above stay with git; this only narrows what git reported.
		const own = new Set(set.paths);
		for (const f of [...ranged]) if (!own.has(f)) ranged.delete(f);
	}

	// Then the working tree: an in-progress edit of a Story file joins; anything
	// else is not the Story's and is only reported.
	await readWorking();
	const storyPaths = new Set(set.paths);
	const excludedUncommitted: string[] = [];
	for (const f of keep(working)) {
		if (storyPaths.has(f)) ranged.add(f);
		else excludedUncommitted.push(f);
	}
	const files = keep(ranged);
	opts?.onAttribution?.({
		attribution: set.attribution,
		sharedWithExcluded: set.sharedWithExcluded.filter(p => files.includes(p)),
		excludedUncommitted: excludedUncommitted.sort(),
	});
	return files;
}

/** Normalise an exclusion entry to the repo-relative form `git_diff` reports.
 *  An absolute path under `repoPath` is relativised; anything else is returned
 *  as given (already relative, or outside the repo and therefore unmatchable). */
function toRepoRelative(repoPath: string, p: string): string {
	if (!isAbsolute(p)) return p;
	const rel = relative(repoPath, p);
	// `..` means the path escapes the repo — it can never match a git path, so leave
	// it alone rather than silently turning it into something that might.
	return rel.length > 0 && !rel.startsWith('..') ? rel : p;
}

/**
 * Build a file-level {@link FileChangeLog} for the BUILD ledger record: one
 * {@link FileChangeEntry} per changed path (segment OMITTED — file-level), stamped
 * with the supplied author/timestamp and, when given, the commit `version`.
 *
 * A git derivation failure is CAUGHT internally and yields `[]` (never thrown out
 * of here) — so the validate phase can populate `body.changeLog` unconditionally
 * and a git-unavailable build still succeeds with an empty (omit-slot) change-log.
 */
export async function collectBuildChangeLog(
	repoPath: string,
	ctx: {
		readonly author: string;
		readonly timestamp: string;
		readonly version?: string | undefined;
		/** Forwarded to {@link changedFiles} — see {@link ChangedFilesOptions}. */
		readonly base?: string | undefined;
		readonly exclude?: readonly string[] | undefined;
		/** `<epicHash>/<storyId>`: the BUILD record's changeLog follows the Story's
		 *  commits; with no base the seam refuses, and the swallow below yields []. */
		readonly storyKey?: string | undefined;
	},
	/** Injectable changed-file seam (defaults to the real git derivation); tests
	 *  stub it. Additive/optional — the mandated 2-arg call sites are unchanged, and
	 *  a 1-parameter stub stays assignable, so existing stubs compile untouched. */
	listChanged: (repoPath: string, opts?: ChangedFilesOptions) => Promise<readonly string[]> = changedFiles,
): Promise<FileChangeLog> {
	// Built conditionally so a ctx carrying neither field passes `undefined` rather
	// than `{ base: undefined, exclude: undefined }` — keeping the seam call, and
	// any recording stub's view of it, identical to today.
	const opts: ChangedFilesOptions | undefined =
		ctx.base !== undefined || ctx.exclude !== undefined || ctx.storyKey !== undefined
			? {
				...(ctx.base !== undefined ? { base: ctx.base } : {}),
				...(ctx.exclude !== undefined ? { exclude: ctx.exclude } : {}),
				...(ctx.storyKey !== undefined ? { storyKey: ctx.storyKey } : {}),
			}
			: undefined;
	let files: readonly string[];
	try {
		files = await listChanged(repoPath, opts);
	} catch (err) {
		log.warn(
			{ repoPath, err: err instanceof Error ? err.message : String(err) },
			'collectBuildChangeLog: could not derive the changed set; returning an empty change-log',
		);
		return [];
	}
	return files.map((file): FileChangeEntry => ({
		target:    { file, ...(ctx.version !== undefined && ctx.version.length > 0 ? { version: ctx.version } : {}) },
		author:    ctx.author,
		timestamp: ctx.timestamp,
	}));
}

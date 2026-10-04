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
 * `collectBuildChangeLog` maps that changed set into a file-level {@link ChangeLog}
 * for the BUILD ledger record (S002 t3). It SWALLOWS a git derivation failure and
 * returns `[]` — a build must never fail because the change-log could not be
 * collected.
 */

import { isAbsolute, relative } from 'node:path';

import { gitDiffTool } from '../../../daemon/tools/builtins/git/diff.js';
import type { GitDiffData } from '../../../daemon/tools/builtins/git/diff.js';
import type { ToolDeps } from '../../../daemon/tools/types.js';
import { getLogger } from '../../../shared/logger.js';
import type { ChangeLog, ChangeLogEntry } from '../../artifacts/provenance/types.js';

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
 * These are records ABOUT the work — artifact json, the build-start stamps, and
 * the rendered documents — not the work itself, so a code review leaves them out.
 * The first glob is deliberately flat: `.insrc/artifacts/templates/` and
 * `.insrc/artifacts/formats/` hold USER-authored files that a Story may change
 * and that must stay reviewable, as must `.insrc/templates|feedback|conventions`.
 *
 * Passed to git (see {@link ChangedFilesOptions.excludeGlobs}) rather than
 * matched here, so there is one implementation of the glob semantics — git's.
 */
export const LEDGER_EXCLUDE_GLOBS: readonly string[] = Object.freeze([
	'.insrc/artifacts/*.json',
	'.insrc/build-start/**',
	'docs/epics/**',
	'docs/standalone/**',
]);

/** Additive options for {@link changedFiles}. Every field is OPTIONAL and the
 *  derivation is bit-for-bit unchanged when none is supplied, so every
 *  existing single-argument call site keeps its current result. */
export interface ChangedFilesOptions {
	/** Start of the Story's COMMITTED range. Consulted ONLY when the working tree
	 *  is clean — which is exactly when it is needed, because the implement prompt
	 *  mandates committing before the validate phase runs, so the working-tree
	 *  derivation sees nothing. A dirty tree keeps using the working tree and never
	 *  looks at the base. */
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
 * Derive the changed-file set from the working-tree diff (unstaged ∪ staged) via
 * the `git_diff` builtin. Read-only; throws `NoBuildChangesError` on git failure.
 *
 * With `opts.base`, a CLEAN working tree additionally derives the committed range
 * `base..HEAD`. That ordering is the point of the Story: the collector runs after
 * the implement prompt has committed, so the working tree is empty precisely when
 * the change set matters. A dirty tree is left exactly as it was — the base is not
 * consulted at all, so the result cannot depend on which range was supplied.
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

	const working = new Set<string>();
	for (const staged of [false, true]) {
		await collectDiff(repoPath, { staged, ...globs }, working);
	}
	// Exclusion runs BEFORE the emptiness gate, and that order is the whole point.
	// The record's own json + md are the paths THIS collector's caller is about to
	// write, so they are not evidence of a dirty tree — at completion time they are
	// typically the ONLY dirty paths. Testing size first let them stand in for real
	// work: the range was skipped as "tree is dirty", the set then filtered to
	// nothing, and the record silently kept the previous write's file list.
	const kept = keep(working);
	if (kept.length > 0) return kept;

	// Committed-range fallback: only when the working tree yielded nothing of the
	// Story's own. A tree carrying real uncommitted work never reaches here, so the
	// result still cannot depend on which range was supplied.
	if (opts?.base !== undefined && opts.base.length > 0) {
		const ranged = new Set<string>();
		await collectDiff(repoPath, { from: opts.base, ...globs }, ranged);
		return keep(ranged);
	}
	return kept;
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
 * Build a file-level {@link ChangeLog} for the BUILD ledger record: one
 * {@link ChangeLogEntry} per changed path (segment OMITTED — file-level), stamped
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
	},
	/** Injectable changed-file seam (defaults to the real git derivation); tests
	 *  stub it. Additive/optional — the mandated 2-arg call sites are unchanged, and
	 *  a 1-parameter stub stays assignable, so existing stubs compile untouched. */
	listChanged: (repoPath: string, opts?: ChangedFilesOptions) => Promise<readonly string[]> = changedFiles,
): Promise<ChangeLog> {
	// Built conditionally so a ctx carrying neither field passes `undefined` rather
	// than `{ base: undefined, exclude: undefined }` — keeping the seam call, and
	// any recording stub's view of it, identical to today.
	const opts: ChangedFilesOptions | undefined =
		ctx.base !== undefined || ctx.exclude !== undefined
			? { ...(ctx.base !== undefined ? { base: ctx.base } : {}), ...(ctx.exclude !== undefined ? { exclude: ctx.exclude } : {}) }
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
	return files.map((file): ChangeLogEntry => ({
		target:    { file, ...(ctx.version !== undefined && ctx.version.length > 0 ? { version: ctx.version } : {}) },
		author:    ctx.author,
		timestamp: ctx.timestamp,
	}));
}

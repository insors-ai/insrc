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

/** Derive the changed-file set from the working-tree diff (unstaged ∪ staged)
 *  via the `git_diff` builtin. Read-only; throws `NoBuildChangesError` on git
 *  failure. */
export async function changedFiles(repoPath: string): Promise<readonly string[]> {
	const toolDeps: ToolDeps = { sessionId: 'code-review', repoPath, send: () => {}, requestId: 0 };
	const paths = new Set<string>();
	for (const staged of [false, true]) {
		const res = await gitDiffTool.execute({ cwd: repoPath, staged }, toolDeps);
		if (!res.success) {
			throw new NoBuildChangesError(`git_diff failed for ${repoPath}: ${res.error ?? res.output}`);
		}
		const data = res.data as GitDiffData | undefined;
		if (!data) throw new NoBuildChangesError(`git_diff returned no data for ${repoPath}`);
		for (const f of data.files) paths.add(f.path);
	}
	return [...paths];
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
	ctx: { readonly author: string; readonly timestamp: string; readonly version?: string | undefined },
	/** Injectable changed-file seam (defaults to the real git derivation); tests
	 *  stub it. Additive/optional — the mandated 2-arg call sites are unchanged. */
	listChanged: (repoPath: string) => Promise<readonly string[]> = changedFiles,
): Promise<ChangeLog> {
	let files: readonly string[];
	try {
		files = await listChanged(repoPath);
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

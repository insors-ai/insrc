/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Code-review S001 · T002 — `resolveCodeReviewSubject` (the sc1 resolver).
 *
 * Composes the existing approval gates and the git changed-file set into a
 * `CodeReviewSubjectResult`, WITHOUT ever producing a verdict:
 *
 *   - the LLD and the PLAN are each resolved in their OWN try; a missing/
 *     unapproved contract (the gate throws `ArtifactMissingError` /
 *     `ArtifactNotApprovedError`) maps that ONE contract to `null` — it is NO
 *     LONGER a failure. The review MODE is then derivable from which contracts
 *     are present: (A) both → implementation-correctness, (B) LLD only →
 *     LLD-contract review, (C) neither → pure code review;
 *   - a changed-file set that cannot be derived (git unavailable / not a repo)
 *     => {ok:false, reason:'no-build-record'} — nothing was built to review.
 *     This is now the ONLY decline reason;
 *   - `UnregisteredRepoError` (and any other non-Artifact error) PROPAGATES
 *     unchanged (operator misconfiguration, not a missing-contract condition).
 *
 * The changed-file set is git-DERIVED — the build record is consumed for
 * identity only and is never re-recorded or duplicated (k9). Since the tracked
 * workflow runs build → review → commit, at review time the build's changes are
 * the uncommitted working-tree diff (HEAD vs worktree, plus staged), so that is
 * the "Story's build changed" set. An empty diff is a valid (trivial) subject,
 * NOT an error.
 *
 * The gate + git seams are injectable (`SubjectDeps`) so the unit tests fake
 * them; the defaults wire the real `requireApprovedLld` / `requireApprovedPlan`
 * gates and the `git_diff` builtin. The whole path is read-only.
 */

import { requireApprovedLld, requireApprovedPlan, ArtifactMissingError, ArtifactNotApprovedError } from '../gates.js';
import { gitDiffTool } from '../../daemon/tools/builtins/git/diff.js';
import type { GitDiffData } from '../../daemon/tools/builtins/git/diff.js';
import type { ToolDeps } from '../../daemon/tools/types.js';
import type { LldArtifact } from '../artifacts/lld.js';
import type { PlanArtifact } from '../artifacts/plan.js';
import type { StandaloneBuildRecord } from '../runners/build/standalone-record.js';
import type { CodeReviewSubjectResult } from './types.js';

/** Raised by a git seam that cannot derive a changed-file set (e.g. not a git
 *  repository / git failed). Mapped by the resolver to `reason:'no-build-record'`. */
export class NoBuildChangesError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'NoBuildChangesError';
	}
}

/** The injectable seams `resolveCodeReviewSubject` composes. Defaults wire the
 *  real gates + `git_diff` builtin; tests supply fakes. */
export interface SubjectDeps {
	readonly requireApprovedLld:  (repoPath: string, epicHash: string, storyId: string) => LldArtifact;
	readonly requireApprovedPlan: (repoPath: string, epicHash: string, storyId: string) => PlanArtifact;
	/** Returns the Story's build changed-file set (repo-relative paths), or
	 *  throws `NoBuildChangesError` when it cannot be derived. */
	readonly changedFiles: (repoPath: string) => Promise<readonly string[]>;
	/** Reads the persisted build record for identity; `null` when none. Read-only. */
	readonly readBuildRecord?: (repoPath: string, epicHash: string, storyId: string) => StandaloneBuildRecord | null;
}

/** Derive the changed-file set from the working-tree diff (unstaged ∪ staged)
 *  via the `git_diff` builtin. Read-only; throws `NoBuildChangesError` on git
 *  failure. */
async function realChangedFiles(repoPath: string): Promise<readonly string[]> {
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

const DEFAULT_DEPS: SubjectDeps = {
	requireApprovedLld,
	requireApprovedPlan,
	changedFiles:    realChangedFiles,
};

/** Resolve the fixed per-Story review subject. Never throws for a
 *  missing contract or build — those become an `ok:false` reason. Read-only. */
export async function resolveCodeReviewSubject(
	repoPath: string,
	epicHash: string,
	storyId:  string,
	deps:     SubjectDeps = DEFAULT_DEPS,
): Promise<CodeReviewSubjectResult> {
	// 1. Approved contracts (LLD + PLAN) — each OPTIONAL, resolved in its OWN
	//    try so a missing/unapproved contract maps to `null` for that field
	//    only (never a failure). A non-Artifact error (UnregisteredRepoError,
	//    a corrupt-artifact parse fault, …) still propagates unchanged — it must
	//    never be silently swallowed into a null that would mask corruption as
	//    "mode C".
	let approvedLld:  LldArtifact  | null = null;
	let approvedPlan: PlanArtifact | null = null;
	try {
		approvedLld = deps.requireApprovedLld(repoPath, epicHash, storyId);
	} catch (err) {
		if (!(err instanceof ArtifactMissingError || err instanceof ArtifactNotApprovedError)) throw err;
	}
	try {
		approvedPlan = deps.requireApprovedPlan(repoPath, epicHash, storyId);
	} catch (err) {
		if (!(err instanceof ArtifactMissingError || err instanceof ArtifactNotApprovedError)) throw err;
	}

	// 2. The git-derived changed-file set. A derivation failure => 'no-build-record'.
	let changedFiles: readonly string[];
	try {
		changedFiles = await deps.changedFiles(repoPath);
	} catch (err) {
		if (err instanceof NoBuildChangesError) {
			return { ok: false, reason: 'no-build-record' };
		}
		throw err;
	}

	const buildRecord = deps.readBuildRecord?.(repoPath, epicHash, storyId) ?? null;

	return {
		ok: true,
		subject: { repoPath, epicHash, storyId, changedFiles, approvedLld, approvedPlan, buildRecord },
	};
}

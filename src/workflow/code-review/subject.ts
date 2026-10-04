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
import { getLogger } from '../../shared/logger.js';
import { changedFiles as realChangedFiles, LEDGER_EXCLUDE_GLOBS, NoBuildChangesError } from '../runners/build/changed-files.js';
import type { ChangedFilesOptions } from '../runners/build/changed-files.js';
import { resolveStoryRangeBase } from '../runners/build/range-base.js';
import type { LldArtifact } from '../artifacts/lld.js';
import type { PlanArtifact } from '../artifacts/plan.js';
import type { StandaloneBuildRecord } from '../runners/build/standalone-record.js';
import type { CodeReviewSubjectResult } from './types.js';

const log = getLogger('workflow:code-review:subject');

// S002 t2: the git changed-file seam + its `NoBuildChangesError` moved to the
// shared `runners/build/changed-files.ts` so the BUILD runner reuses it without
// importing this module. Re-exported here so existing importers (and tests) that
// pull `NoBuildChangesError` from `./subject.js` are unchanged.
export { NoBuildChangesError };

/** The injectable seams `resolveCodeReviewSubject` composes. Defaults wire the
 *  real gates + `git_diff` builtin; tests supply fakes. */
export interface SubjectDeps {
	readonly requireApprovedLld:  (repoPath: string, epicHash: string, storyId: string) => LldArtifact;
	readonly requireApprovedPlan: (repoPath: string, epicHash: string, storyId: string) => PlanArtifact;
	/** Returns the Story's build changed-file set (repo-relative paths), or
	 *  throws `NoBuildChangesError` when it cannot be derived. */
	readonly changedFiles: (repoPath: string, opts?: ChangedFilesOptions) => Promise<readonly string[]>;
	/** The Story's range base (ISSUE-5f7a7cb9); defaults to the one resolver the
	 *  BUILD writers use, so the review and the record measure from the same commit. */
	readonly resolveRangeBase?: ((repoPath: string, epicHash: string, storyId: string) => string | undefined) | undefined;
	/** Reads the persisted build record for identity; `null` when none. Read-only. */
	readonly readBuildRecord?: (repoPath: string, epicHash: string, storyId: string) => StandaloneBuildRecord | null;
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

	// 2. The git-derived changed-file set.
	//
	// The review measures from the Story's range base and leaves the workflow's
	// own ledger files out (ISSUE-5f7a7cb9): with the Story committed, the only
	// dirty path is often an approval-stamped artifact json, and without this that
	// one file became the whole reviewed set.
	//
	// That derivation asks more of git than the old one did — a base it can
	// resolve and exclude pathspecs it accepts — so it must not become a new way
	// for the review to fail to start. Each attempt that throws steps DOWN to a
	// plainer one, and the last is the call this function has always made. Only
	// when THAT fails is the answer 'no-build-record', exactly as before.
	const base = (deps.resolveRangeBase ?? resolveStoryRangeBase)(repoPath, epicHash, storyId);
	const attempts: ReadonlyArray<{ readonly label: string; readonly opts: ChangedFilesOptions | undefined }> = [
		...(base !== undefined ? [{ label: 'range base + ledger exclusion', opts: { base, excludeGlobs: LEDGER_EXCLUDE_GLOBS } }] : []),
		{ label: 'ledger exclusion only', opts: { excludeGlobs: LEDGER_EXCLUDE_GLOBS } },
		{ label: 'plain working-tree derivation', opts: undefined },
	];
	let changedFiles: readonly string[] | undefined;
	for (const [i, attempt] of attempts.entries()) {
		try {
			// The last attempt passes ONE argument, so it is byte-for-byte the old call.
			changedFiles = attempt.opts === undefined
				? await deps.changedFiles(repoPath)
				: await deps.changedFiles(repoPath, attempt.opts);
			break;
		} catch (err) {
			if (!(err instanceof NoBuildChangesError)) throw err;
			const next = attempts[i + 1];
			if (next === undefined) return { ok: false, reason: 'no-build-record' };
			log.warn(
				{ repoPath, epicHash, storyId, failed: attempt.label, fallingBackTo: next.label, err: err.message },
				'resolveCodeReviewSubject: changed-set derivation failed; falling back to a plainer one',
			);
		}
	}
	if (changedFiles === undefined) return { ok: false, reason: 'no-build-record' };

	const buildRecord = deps.readBuildRecord?.(repoPath, epicHash, storyId) ?? null;

	return {
		ok: true,
		subject: { repoPath, epicHash, storyId, changedFiles, approvedLld, approvedPlan, buildRecord },
	};
}

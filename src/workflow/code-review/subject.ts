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
 * The changed-file set is git-DERIVED — the build record is never re-recorded or
 * duplicated (k9). The BUILD and TESTS records are read for the coverage
 * dimension's pass-state (ISSUE-1102dc71). Since the tracked
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
import type { ChangeSetAttributionReport, ChangedFilesOptions } from '../runners/build/changed-files.js';
import { resolveStoryRangeBase } from '../runners/build/range-base.js';
import type { LldArtifact } from '../artifacts/lld.js';
import type { PlanArtifact } from '../artifacts/plan.js';
import { existsSync, readFileSync } from 'node:fs';

import { artifactJsonPath, buildArtifactId } from '../storage.js';
import type { BuildRecord } from '../runners/build/standalone-record.js';
import { readTestRecord as realReadTestRecord, type TestRecord } from '../runners/build/test-record.js';
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
	readonly readBuildRecord?: (repoPath: string, epicHash: string, storyId: string) => BuildRecord | null;
	/** Reads the Story's TESTS record; `null` when none or unreadable. Read-only. */
	readonly readTestRecord?: (repoPath: string, epicHash: string, storyId: string) => TestRecord | null;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whether `v` has the BuildRecord shape the review reads: build meta naming the
 *  Story, an object body, and (when present) tasks with a string id and an
 *  optional boolean `passed`. */
function isBuildRecord(v: unknown, epicHash: string, storyId: string): v is BuildRecord {
	if (!isPlainObject(v) || !isPlainObject(v['meta']) || !isPlainObject(v['body'])) return false;
	const meta = v['meta'];
	const tasks = v['body']['tasks'];
	return meta['workflow'] === 'build' && meta['epicHash'] === epicHash && meta['storyId'] === storyId
		&& typeof meta['createdAt'] === 'string'
		&& (tasks === undefined || (Array.isArray(tasks) && tasks.every(t =>
			isPlainObject(t) && typeof t['id'] === 'string' && (t['passed'] === undefined || typeof t['passed'] === 'boolean'))));
}

/** The Story's BUILD record from `.insrc/artifacts`, or null (with a warning)
 *  when it is absent, unreadable, or not a build record for this Story. Never throws. */
export function readStoryBuildRecord(repoPath: string, epicHash: string, storyId: string): BuildRecord | null {
	const jsonPath = artifactJsonPath(repoPath, buildArtifactId(epicHash, storyId));
	if (!existsSync(jsonPath)) {
		log.warn({ jsonPath }, 'resolveCodeReviewSubject: the Story has no BUILD record; coverage gets no per-task result');
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(readFileSync(jsonPath, 'utf8'));
		if (isBuildRecord(parsed, epicHash, storyId)) return parsed;
		log.warn({ jsonPath }, 'resolveCodeReviewSubject: the BUILD record does not have a build record\'s shape; treating it as absent');
	} catch (err) {
		log.warn({ jsonPath, err: err instanceof Error ? err.message : String(err) }, 'resolveCodeReviewSubject: the BUILD record is unreadable; treating it as absent');
	}
	return null;
}

const DEFAULT_DEPS: SubjectDeps = {
	requireApprovedLld,
	requireApprovedPlan,
	changedFiles:    realChangedFiles,
	readBuildRecord: readStoryBuildRecord,
	readTestRecord:  realReadTestRecord,
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
	// The range-base attempt keeps only the Story's trailered commits and says how
	// it scoped the set (ISSUE-b47dadc7). The plainer attempts take no base, so
	// they can only derive from the working tree.
	const seen: { report?: ChangeSetAttributionReport | undefined } = {};
	const onAttribution = (a: ChangeSetAttributionReport): void => { seen.report = a; };
	// Read through a function: the seam sets it during the await, which narrowing cannot see.
	const reported = (): ChangeSetAttributionReport | undefined => seen.report;
	const attempts: ReadonlyArray<{ readonly label: string; readonly opts: ChangedFilesOptions | undefined }> = [
		...(base !== undefined ? [{
			label: 'range base + ledger exclusion',
			opts: { base, excludeGlobs: LEDGER_EXCLUDE_GLOBS, storyKey: `${epicHash}/${storyId}`, onAttribution },
		}] : []),
		{ label: 'ledger exclusion only', opts: { excludeGlobs: LEDGER_EXCLUDE_GLOBS } },
		{ label: 'plain working-tree derivation', opts: undefined },
	];
	let changedFiles: readonly string[] | undefined;
	let changeSetAttribution: ChangeSetAttributionReport['attribution'] | undefined;
	for (const [i, attempt] of attempts.entries()) {
		try {
			seen.report = undefined;
			// The last attempt passes ONE argument, so it is byte-for-byte the old call.
			changedFiles = attempt.opts === undefined
				? await deps.changedFiles(repoPath)
				: await deps.changedFiles(repoPath, attempt.opts);
			changeSetAttribution = attempt.opts?.base !== undefined ? reported()?.attribution : 'working-tree';
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
	const testRecord  = deps.readTestRecord?.(repoPath, epicHash, storyId) ?? null;
	const scoped      = reported();

	return {
		ok: true,
		subject: {
			repoPath, epicHash, storyId, changedFiles, approvedLld, approvedPlan, buildRecord, testRecord,
			...(changeSetAttribution !== undefined ? { changeSetAttribution } : {}),
			...(scoped !== undefined ? { sharedWithExcluded: scoped.sharedWithExcluded } : {}),
		},
	};
}

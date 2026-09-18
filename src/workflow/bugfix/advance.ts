/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S004 — the composed post-issue advance (the orchestration entrypoint the
 * controller calls AFTER an IssueArtifact is approved). It gates on
 * `meta.workflow === 'issue'` (+ the bugfixCategory flag) so a non-bugfix
 * approval path is untouched, then runs: locateAndStampParent → admitBugfixAdvance
 * → nextAfterIssue. Completion stays on the existing approveWorkflowTarget path
 * (this module adds no completion code).
 */

import { admitBugfixAdvance } from './admit.js';
import { nextAfterIssue } from './next-after-issue.js';
import { locateAndStampParent } from './stamp.js';
import { closeBugfixTrackerIssue } from './tracker.js';
import type { AdvanceResult, AdvanceTrackerDeps, StampDeps } from './types.js';
import type { TrackerCloseDeps, TrackerCloseResult } from './tracker.js';

/**
 * Advance a bugfix past its approved issue. `skipped` is returned (nothing
 * mutated) when the target is not an eligible bugfix issue; otherwise the parent
 * is located + stamped, the advance gate is checked, and — if admitted — the
 * routed next-stage nextCall is returned.
 */
export async function advanceBugfixAfterIssue(
	input: { repoPath: string; issueHash: string; repo: string },
	deps: StampDeps,
	opts?: { readonly bugfixCategory?: boolean; readonly tracker?: AdvanceTrackerDeps },
): Promise<AdvanceResult> {
	if (opts?.bugfixCategory === false) {
		return { skipped: 'bugfixCategory flag is disabled' };
	}

	const issue = deps.readIssue(input.repoPath, input.issueHash);
	if (issue === null) {
		throw new Error(`advanceBugfixAfterIssue: issue-not-found for issueHash '${input.issueHash}'`);
	}
	// Provably scoped to bugfix issues — a non-issue artifact is never advanced.
	if (issue.meta.workflow !== 'issue') {
		return { skipped: `not an issue artifact (meta.workflow='${String(issue.meta.workflow)}')` };
	}

	const location = await locateAndStampParent(
		{ repoPath: input.repoPath, issueHash: input.issueHash },
		deps,
	);

	// Re-read so the admission gate sees the just-stamped parentRef.
	const stamped = deps.readIssue(input.repoPath, input.issueHash) ?? issue;
	const admission = admitBugfixAdvance(stamped);
	if (!admission.admitted) {
		return { location, admission };
	}

	// S005: surface the approved issue to GitHub (create + link + record). Runs
	// ONLY at this post-approval, post-stamp point and ONLY when tracker create
	// deps are injected; a repo with no tracker configured is a no-op (skipped).
	// Additive — a caller that injects no tracker behaves exactly as S004.
	const nextCall = nextAfterIssue(stamped, input.repo);
	if (opts?.tracker === undefined) {
		return { location, admission, nextCall };
	}
	const trackerIssue = await opts.tracker.createTrackerIssue(
		{ repoPath: input.repoPath, issueHash: input.issueHash },
		opts.tracker.createDeps,
	);
	return { location, admission, nextCall, trackerIssue };
}

/**
 * S005 — the completion-path seam. The completion gate (BUILD approval of a
 * bugfix) calls this to close the GH issue created for the fix. A no-op when no
 * tracker is configured or nothing was created (ac2 symmetry); bugfixCategory-
 * gated so a non-bugfix completion is untouched.
 */
export async function completeBugfixTracker(
	input: { repoPath: string; issueHash: string },
	deps: TrackerCloseDeps,
	opts?: { readonly bugfixCategory?: boolean },
): Promise<TrackerCloseResult> {
	if (opts?.bugfixCategory === false) {
		return { status: 'skipped', reason: 'bugfixCategory flag is disabled' };
	}
	return closeBugfixTrackerIssue(input, deps);
}

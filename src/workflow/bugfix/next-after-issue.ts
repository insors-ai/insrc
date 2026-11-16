/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S004 — the pure magnitude advance-route (the analog of `buildNextCall` for
 * step-2). Reads the approved IssueArtifact's magnitude and emits the routed
 * next-stage nextCall: small => issue→build (no LLD/plan); sized =>
 * issue→design→plan→build. Consumes sc1's route table; never re-implements the
 * size decision. Pure — reads meta only, no IO.
 */

import type { IssueArtifact } from '../artifacts/issue.js';
import { IMPLIED_ISSUE_STORY_ID } from '../storage.js';
import { routeForSizeClass } from '../triage/classify.js';
import type { BugfixNextCall } from './types.js';

/**
 * Emit the routed next-stage call for a bugfix that has cleared its approved
 * issue. `repo` is forwarded into the emitted params (matching buildNextCall).
 *
 * @throws when `issue.meta.issueHash` is not a 16-hex hash (invalid-issue-hash).
 * @throws when `issue.meta.magnitude` is neither 'small' nor 'sized' — a
 *         non-bugfix / malformed issue reached the bugfix advance; we refuse to
 *         mis-route rather than default to a stage.
 */
export function nextAfterIssue(issue: IssueArtifact, repo: string): BugfixNextCall {
	// The ISSUE's own hash is the work item's identity: the build (or the LLD)
	// lands under it, so the BUILD record has the ISSUE as its head and its
	// Story completes on approval. Without it the next stage would mint a
	// headless identity of its own, so refuse rather than emit such a call.
	const issueHash = issue.meta.issueHash;
	if (typeof issueHash !== 'string' || !/^[0-9a-f]{16}$/.test(issueHash)) {
		throw new Error(
			`nextAfterIssue: invalid-issue-hash — expected a 16-hex meta.issueHash, got ${String(issueHash)}`,
		);
	}
	const magnitude = issue.meta.magnitude;
	if (magnitude !== 'small' && magnitude !== 'sized') {
		throw new Error(
			`nextAfterIssue: invalid-magnitude — expected 'small' | 'sized', got ${String(magnitude)}`,
		);
	}

	// Re-derive the route from sc1 (consumed, not re-implemented). For a bugfix
	// the startStage is always 'issue' (stage-1); producesLld distinguishes the
	// post-issue path: small (false) → build, sized (true) → design.story.
	const route = routeForSizeClass('bugfix', magnitude);
	const title = issue.body.title;
	// The full defect scope — the same text the locator grounds on — carried
	// forward so neither downstream stage loses the reproduction/root-cause/
	// fix-intent captured in the approved issue.
	const scope = [
		issue.body.title,
		issue.body.reproduction,
		issue.body.rootCause,
		issue.body.fixIntent,
	].join('\n\n');

	if (!route.producesLld) {
		// small → straight to build, standalone. A small bugfix is a NO-LLD,
		// scope-statement-driven build — behaviourally the build-step's `trivial`
		// path. handleStandaloneImplement derives `producesLld = sizeClass !==
		// 'trivial'` (it does NOT honour an explicit producesLld), so the routing
		// sizeClass MUST be 'trivial' for the no-LLD admit; passing 'bugfix' would
		// demand an approved LLD the small path never produces. The defect scope
		// rides in `focus`, and the tracked record stays the approved IssueArtifact
		// (which carries meta.parentRef). [Follow-up: a build-step that honours an
		// explicit no-LLD signal would let this carry sizeClass:'bugfix' verbatim.]
		return {
			tool:   'insrc_build_step',
			params: {
				phase:  'implement',
				repo,
				target: '(standalone-bugfix)',
				standalone: { standalone: true, epicHash: issueHash, sizeClass: 'trivial', focus: scope },
			},
		};
	}

	// sized → a standalone design.story (LLD), then the existing design→plan→build
	// upstream gates carry it to build. The full defect body is the spec so the
	// LLD author has the reproduction/root-cause/fix-intent, not just the title.
	// The route EXPLICITLY keeps the ISSUE as the work-item anchor (epicHash) and
	// targets the one implied story (storyId s1), so the LLD lands as
	// LLD-<issueHash>-s1 under the ISSUE's identity instead of minting a fresh
	// hash via augmentStandaloneParams (ISSUE-149283b0d0455a43).
	return {
		tool:   'insrc_workflow_step',
		params: {
			phase:    'start',
			repo,
			workflow: 'design.story',
			focus:    scope,
			params: {
				standalone: true,
				epicHash:   issueHash,
				storyId:    IMPLIED_ISSUE_STORY_ID,
				storyTitle: title,
				storySpec:  scope,
				sizeClass:  'bugfix',
			},
		},
	};
}

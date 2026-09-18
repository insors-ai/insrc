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
import { routeForSizeClass } from '../triage/classify.js';
import type { BugfixNextCall } from './types.js';

/**
 * Emit the routed next-stage call for a bugfix that has cleared its approved
 * issue. `repo` is forwarded into the emitted params (matching buildNextCall).
 *
 * @throws when `issue.meta.magnitude` is neither 'small' nor 'sized' — a
 *         non-bugfix / malformed issue reached the bugfix advance; we refuse to
 *         mis-route rather than default to a stage.
 */
export function nextAfterIssue(issue: IssueArtifact, repo: string): BugfixNextCall {
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

	if (!route.producesLld) {
		// small → straight to build, standalone (the build-step resolver cannot
		// target a hierarchical task without a tracker — mirror buildNextCall's
		// trivial branch's standalone param).
		return {
			tool:   'insrc_build_step',
			params: {
				phase:  'implement',
				repo,
				target: '(standalone-bugfix)',
				standalone: { standalone: true, sizeClass: 'bugfix', focus: title },
			},
		};
	}

	// sized → a standalone design.story (LLD), then the existing design→plan→build
	// upstream gates carry it to build.
	return {
		tool:   'insrc_workflow_run',
		params: {
			repo,
			workflow: 'design.story',
			focus:    title,
			params: {
				standalone: true,
				storyTitle: title,
				storySpec:  title,
				sizeClass:  'bugfix',
			},
		},
	};
}

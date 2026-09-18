/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S004 / scope-gated bugfix orchestration — internal helper types.
 *
 * s4 owns NO shared contract; it composes sc1 (the route table), sc2 (the
 * approved IssueArtifact) and sc3 (the parent-locator) into the run sequence.
 * These types are module-internal; nothing here is an sc-level shared type.
 */

import type { IssueArtifact } from '../artifacts/issue.js';
import type { ParentLocation } from '../locate/index.js';
import type { WorkItemRef } from '../types.js';

/** The routed next-stage descriptor — the SAME shape `buildNextCall` emits
 *  (src/mcp/triage-step/phases/classify.ts), re-declared locally so s4 does not
 *  import triage-step internals. */
export interface BugfixNextCall {
	readonly tool:   'insrc_workflow_run' | 'insrc_build_step';
	readonly params: Record<string, unknown>;
}

/** Injected collaborators for `locateAndStampParent`, so the stamp is testable
 *  without a DB. `locateParent` is the pre-bound sc3 entry point (the caller
 *  supplies its DB-bound deps); `readIssue`/`writeParentRef` wrap the existing
 *  storage round-trip. */
export interface StampDeps {
	readonly readIssue:      (repoPath: string, issueHash: string) => IssueArtifact | null;
	readonly locateParent:   (input: { touchedPaths: string[]; defectDescription: string }) => Promise<ParentLocation>;
	readonly writeParentRef: (repoPath: string, issueHash: string, ref: WorkItemRef | null) => void;
}

/** The admission-gate verdict for advancing a bugfix past its issue. */
export interface AdmitResult {
	readonly admitted: boolean;
	readonly reason?:  string;
}

/** The composed post-issue advance outcome (the t5 orchestration entrypoint). */
export interface AdvanceResult {
	/** Set when the input is not an eligible bugfix issue (non-issue artifact,
	 *  or the bugfixCategory flag is off) — nothing was stamped or routed. */
	readonly skipped?:   string;
	/** The sc3 decision, when a locate ran. */
	readonly location?:  ParentLocation;
	/** The advance-gate verdict, when it ran. */
	readonly admission?: AdmitResult;
	/** The routed next-stage call, present only when admitted. */
	readonly nextCall?:  BugfixNextCall;
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S003 / sc3 — the tiered parent-locator value types.
 *
 * A bugfix is attached to the epic/story whose behaviour it corrects by a fixed
 * tier order: deterministic (explicit ref) → graph code-ownership → semantic
 * match → user prompt → standalone. This module declares the shapes; the policy
 * lives in `locate-parent.ts` (pure, controller-side) and the DB-bound inference
 * in `infer.ts` (daemon-side behind an IPC). All additive — no existing type is
 * reshaped. `WorkItemRef` is reused verbatim from `../types.js` (added in S002).
 */

import type { ResolvedRef } from '../tracker/resolve.js';
import type { WorkItemRef } from '../types.js';

/** Which tier decided the parent attachment. Fixed order; `standalone` is the
 *  terminal fallback (no owner found / user supplied none). */
export type LocateTier =
	| 'deterministic'
	| 'graph-ownership'
	| 'semantic'
	| 'prompt'
	| 'standalone';

/** The sc3 decision record — pure data. `parentRef` is `null` iff
 *  `tier === 'standalone'`. `confidence` is 0..1; an auto-attach only happens
 *  above the deciding tier's threshold. `evidence` holds the cited files /
 *  entities / refs that grounded the match. */
export interface ParentLocation {
	readonly tier:       LocateTier;
	readonly parentRef:  WorkItemRef | null;
	readonly confidence: number;
	readonly evidence:   readonly string[];
}

/** One ranked inference candidate. Raw score, no threshold applied — the
 *  controller policy owns the threshold + tier-order decision. */
export interface RankedCandidate {
	readonly parentRef: WorkItemRef;
	readonly score:     number;
	readonly evidence:  readonly string[];
}

/** The daemon inference return: ranked graph-ownership + semantic candidates.
 *  Carried across the `locate.inferParents` IPC. */
export interface InferredCandidates {
	readonly graph:    readonly RankedCandidate[];
	readonly semantic: readonly RankedCandidate[];
}

/** The locate request the controller policy consumes. `explicitRef` is the
 *  optional ref a bugfix spec already carries (tier-1). */
export interface LocateParentInput {
	readonly touchedPaths:      readonly string[];
	readonly defectDescription: string;
	readonly explicitRef?:      string | undefined;
}

/** The DB-bound inference request (crosses the IPC boundary). */
export interface InferParentsRequest {
	readonly repoPath:          string;
	readonly touchedPaths:      readonly string[];
	readonly defectDescription: string;
}

/** Per-tier auto-attach thresholds. A candidate must score `>=` the tier's
 *  threshold (and be the unambiguous top) to attach without prompting (lc1). */
export interface LocateThresholds {
	readonly graph:    number;
	readonly semantic: number;
}

/** Injected collaborators so the tier policy is a pure function unit-testable
 *  without a DB. `inferCandidates` reaches the daemon (rule 1); `resolveRef` is
 *  the pure-fs deterministic resolver; `promptForRef` surfaces the user prompt. */
export interface LocateParentDeps {
	readonly repoPath:        string;
	readonly resolveRef:      (repoPath: string, identifier: string) => ResolvedRef | null;
	readonly inferCandidates: (req: InferParentsRequest) => Promise<InferredCandidates>;
	readonly promptForRef:    () => Promise<string | null>;
	readonly thresholds:      LocateThresholds;
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Triage router types — the classification-first workflow entry.
 *
 * A request is sized FIRST, and the size decides where the workflow starts.
 * See `plans/feature-triage-router.md` for the taxonomy and rationale.
 */

import type { WorkflowName } from '../types.js';

/** The four size tiers. Locked with the user. */
export type SizeClass = 'epic' | 'feature' | 'small' | 'trivial';

export const SIZE_CLASSES: readonly SizeClass[] = ['epic', 'feature', 'small', 'trivial'];

/** Where a classified request enters the chain, and how much ceremony it carries. */
export interface TriageRoute {
	/** The workflow to start at. */
	readonly startStage: WorkflowName;
	/** Whether the entry runs OUTSIDE an Epic (no parent DEF/HLD). True for
	 *  every non-`epic` tier — the enabling standalone-entry capability. */
	readonly standalone: boolean;
	/** Whether a `plan` stage runs between the LLD and `build`. */
	readonly needsPlan: boolean;
	/** Whether an LLD (design artifact) is produced at all. `false` only for
	 *  `trivial`, which routes straight to `build`. */
	readonly producesLld: boolean;
}

/** One concrete, graph-grounded signal the classifier cited for its verdict —
 *  a module touched, a caller count, a new-vs-reuse call. Keeps the size
 *  materiality-gated (cite evidence, not vibes), mirroring the review rubric. */
export interface TriageSignal {
	readonly kind: 'modules-touched' | 'callers' | 'new-subsystem' | 'new-vs-reuse'
		| 'cross-cutting' | 'storage-or-schema' | 'external-contract' | 'other';
	readonly detail: string;
	/** Real repo paths / entity ids this signal is grounded in. */
	readonly evidence: readonly string[];
}

/** The classifier's output for one request. */
export interface TriageResult {
	readonly sizeClass: SizeClass;
	readonly route: TriageRoute;
	/** One-paragraph justification tying the size to the cited signals. */
	readonly rationale: string;
	readonly signals: readonly TriageSignal[];
	/** A short imperative title for the standalone story, when routed below
	 *  Epic (used as `params.storyTitle` for a standalone `design.story`). */
	readonly storyTitle: string;
}

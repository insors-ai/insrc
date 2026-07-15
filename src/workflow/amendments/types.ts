/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * HLD amendment types — Phase E.
 *
 * Mirrors `plans/workflow-design.md` §11.2. Every amendment is a
 * self-contained, mechanically-appliable delta to the base HLD.
 * Ten shapes, each with its own invariants enforced by the applier.
 *
 * Amendments are IMMUTABLE once written. A rejected amendment
 * never gets reused; the downstream step must re-propose with a
 * new id.
 */

import type { Citation } from '../types.js';

// ---------------------------------------------------------------------------
// Field / method specs used by shared-contract amendments
// ---------------------------------------------------------------------------

/** Type-level field spec (matches the interface-sketch grammar). */
export interface FieldSpec {
	readonly name:     string;
	readonly type:     string;
	readonly optional: boolean;
	readonly purpose:  string;
}

/** Type-level method spec — signature only, no body. */
export interface MethodSpec {
	readonly name:      string;
	readonly signature: string;                     // TS signature or equivalent; NO body
	readonly purpose:   string;
}

// ---------------------------------------------------------------------------
// Amendment union
// ---------------------------------------------------------------------------

export type Amendment =
	| SharedContractFieldAdd
	| SharedContractFieldRemove
	| SharedContractRename
	| SharedContractMethodAdd
	| StoryBoundaryReassignOwnership
	| StoryBoundaryAddConsumer
	| StoryBoundaryAddStory
	| NonFunctionalRetarget
	| RolloutReorder
	| RolloutSplitPhase
	| RolloutMergePhases;

// ---------------------------------------------------------------------------
// sharedContract.*
// ---------------------------------------------------------------------------

export interface SharedContractFieldAdd {
	readonly type:       'sharedContract.fieldAdd';
	readonly contractId: string;
	readonly field:      FieldSpec;
	readonly breaking:   false;                     // always additive; enforced
}

export interface SharedContractFieldRemove {
	readonly type:         'sharedContract.fieldRemove';
	readonly contractId:   string;
	readonly fieldName:    string;
	readonly breaking:     true;
	readonly migrationCue: string;                  // required
}

export interface SharedContractRename {
	readonly type:         'sharedContract.rename';
	readonly contractId:   string;
	readonly oldName:      string;
	readonly newName:      string;
	readonly breaking:     true;
	readonly migrationCue: string;
}

export interface SharedContractMethodAdd {
	readonly type:       'sharedContract.methodAdd';
	readonly contractId: string;
	readonly method:     MethodSpec;
}

// ---------------------------------------------------------------------------
// storyBoundary.*
// ---------------------------------------------------------------------------

export interface StoryBoundaryReassignOwnership {
	readonly type:       'storyBoundary.reassignOwnership';
	readonly contractId: string;
	readonly oldOwner:   string;                    // story id
	readonly newOwner:   string;                    // story id
	readonly rationale:  string;
}

export interface StoryBoundaryAddConsumer {
	readonly type:       'storyBoundary.addConsumer';
	readonly contractId: string;
	readonly consumer:   string;                    // story id
	// Framework checks the consumer's Story has a dependsOn edge
	// to the owner; if not, this amendment implicitly adds the
	// edge (recorded in AmendmentRecord.sideEffects).
}

/** Adds a brand-new Story's boundary to the HLD — the escape hatch for
 *  extending an approved Epic with a new Story WITHOUT re-running the HLD
 *  (design/§12 open question). Proposed by the `define` workflow's extend
 *  branch; once approved, the effective HLD carries the boundary so
 *  `design.story` can produce the LLD. The Story is added to the Define's
 *  `body.stories` separately (see `appendStoryToDefine`). */
export interface StoryBoundaryAddStory {
	readonly type:      'storyBoundary.addStory';
	readonly storyId:   string;
	readonly owns?:     readonly string[];          // shared-contract ids this Story owns (usually none)
	readonly depends?:  readonly string[];          // shared-contract ids it consumes
	readonly internal:  string;                     // one-line "what's private to this Story"
}

// ---------------------------------------------------------------------------
// nonFunctional
// ---------------------------------------------------------------------------

export interface NonFunctionalRetarget {
	readonly type:      'nonFunctional.retarget';
	readonly property:  'performance' | 'security' | 'observability' | 'durability';
	readonly oldTarget: string;
	readonly newTarget: string;
	readonly rationale: string;
}

// ---------------------------------------------------------------------------
// rollout.*
// ---------------------------------------------------------------------------

export interface RolloutReorder {
	readonly type:          'rollout.reorder';
	readonly newPhaseOrder: readonly string[];      // phase NAMES in new order
}

export interface RolloutSplitPhase {
	readonly type:       'rollout.splitPhase';
	readonly phase:      string;                    // phase name to split
	readonly newPhases:  readonly {
		readonly name:            string;
		readonly includesStories: readonly string[];
	}[];
	// Framework verifies the union of includesStories equals the
	// original phase's stories.
}

export interface RolloutMergePhases {
	readonly type:     'rollout.mergePhases';
	readonly phases:   readonly string[];           // phase names to merge
	readonly newPhase: { readonly name: string };
}

// ---------------------------------------------------------------------------
// On-disk record
// ---------------------------------------------------------------------------

export type AmendmentStatus = 'pending' | 'approved' | 'rejected';

export interface AmendmentSideEffects {
	readonly addedStoryDependencies?: readonly { readonly from: string; readonly to: string }[];
}

export interface AmendmentRecord {
	readonly id:           string;                  // 'AMD-<epicHash>-<n>'
	readonly epicHash:     string;                  // canonical Epic hash
	readonly epicSlug:     string;                  // display slug (from Define)
	readonly hldBaseRunId: string;                  // base HLD this applies to
	readonly amendment:    Amendment;
	readonly rationale:    string;
	readonly citations:    readonly Citation[];
	readonly proposedBy: {
		readonly workflow: string;
		readonly runId:    string;
		readonly storyId?: string;
		readonly stepId:   string;
	};
	readonly sideEffects?: AmendmentSideEffects;
	readonly proposedAt:   string;
	readonly status:       AmendmentStatus;
	readonly approvedAt?:  string;
	readonly approvedBy?:  string;
	readonly rejectedAt?:  string;
	readonly rejectedReason?: string;
}

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

const AMENDMENT_TYPES = new Set<Amendment['type']>([
	'sharedContract.fieldAdd',
	'sharedContract.fieldRemove',
	'sharedContract.rename',
	'sharedContract.methodAdd',
	'storyBoundary.reassignOwnership',
	'storyBoundary.addConsumer',
	'storyBoundary.addStory',
	'nonFunctional.retarget',
	'rollout.reorder',
	'rollout.splitPhase',
	'rollout.mergePhases',
]);

export function isAmendment(v: unknown): v is Amendment {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	return typeof r['type'] === 'string' && AMENDMENT_TYPES.has(r['type'] as Amendment['type']);
}

export function isAmendmentRecord(v: unknown): v is AmendmentRecord {
	if (typeof v !== 'object' || v === null) return false;
	const r = v as Record<string, unknown>;
	if (typeof r['id']           !== 'string') return false;
	if (typeof r['epicHash']     !== 'string') return false;
	if (typeof r['epicSlug']     !== 'string') return false;
	if (typeof r['hldBaseRunId'] !== 'string') return false;
	if (!isAmendment(r['amendment']))          return false;
	if (typeof r['rationale']    !== 'string') return false;
	if (!Array.isArray(r['citations']))        return false;
	if (typeof r['proposedBy']   !== 'object' || r['proposedBy']   === null) return false;
	if (typeof r['proposedAt']   !== 'string') return false;
	if (typeof r['status']       !== 'string') return false;
	return true;
}

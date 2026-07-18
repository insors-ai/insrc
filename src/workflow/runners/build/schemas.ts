/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * JSON schemas for the `build` workflow's step outputs. Each is the
 * structured contract the outer LLM's step response must satisfy.
 * Kept as data so the runner file stays readable.
 *
 * s1 SCOPE: these are SKELETON schemas for a minimal, coherent recipe
 * (context.assemble + a placeholder implement step). The real
 * per-Task edit/test/repair output shape grows in Story s3/s4/s5.
 */

// s1 — context.assemble: a read-only summary of the approved plan the
// build run will implement.
export const buildContextSchema = {
	type: 'object',
	required: ['taskCount', 'summary'],
	additionalProperties: false,
	properties: {
		taskCount: { type: 'integer', minimum: 0 },
		summary:   { type: 'string', minLength: 1 },
		notes:     { type: 'string' },
	},
} as const;

// s2 — tasks.implement: PLACEHOLDER. s1 only records a per-Task outcome
// stub; the real serial CliProvider edit/test/repair loop is s3/s4.
export const tasksImplementSchema = {
	type: 'object',
	required: ['taskOutcomes'],
	additionalProperties: false,
	properties: {
		taskOutcomes: {
			type: 'array',
			items: {
				type: 'object',
				required: ['taskId', 'status'],
				additionalProperties: false,
				properties: {
					taskId:  { type: 'string', minLength: 1 },
					status:  { enum: ['pending', 'implemented', 'failed'] },
					summary: { type: 'string' },
				},
			},
		},
		notes: { type: 'string' },
	},
} as const;

// ---------------------------------------------------------------------------
// sc3 — BuildAdmissionResult (Story s2, Phase B — admission gate)
//
// The start-turn gate verdict `admitBuild` returns before any work list
// is materialized. A discriminated union keyed on `admitted`:
//   - accepted → a THIN plan pointer (no PlanArtifact body embedded — a4
//     was rejected: siblings re-resolve the plan from the pointer).
//   - refused  → a typed `BuildRefusalReason` + s2-authored message +, for
//     `plan-stale` only, the inline drift hashes. `treeUntouched: true` is
//     a STRUCTURAL invariant: the gate is read-only and runs before any
//     Task is touched, so no refusal can leave a mutated tree.
//
// Non-throwing for all four modeled conditions (accepted / plan-missing /
// plan-unapproved / plan-stale) — mirrors `scanLldStaleness`'s return-a-
// typed-verdict-don't-throw discipline. HOW drift is detected stays
// private to this dir; siblings see only this verdict.
// ---------------------------------------------------------------------------

/** The flat set of reasons the `build` admission gate refuses. */
export type BuildRefusalReason = 'plan-missing' | 'plan-unapproved' | 'plan-stale';

/** The thin accepted pointer — id + hash + storyId only, never the full
 *  PlanArtifact (a4 rejected). Downstream Stories re-resolve the plan from
 *  the id; the hash lets them confirm they are on the admitted version. */
export interface BuildAdmissionAccepted {
	readonly planArtifactId:   string;
	readonly planArtifactHash: string;
	readonly storyId:          string;
}

/** The refusal member of sc3. `message` is s2's wording. `staleness` is an
 *  inline literal populated ONLY for `reason: 'plan-stale'` (deliberately
 *  NOT typed from a shared staleness.ts export — that would breach the s2
 *  boundary). `treeUntouched: true` is structural, not asserted. */
export interface BuildAdmissionRefusal {
	readonly reason:    BuildRefusalReason;
	readonly message:   string;
	readonly staleness?: {
		readonly planRecordedDesignHash: string;
		readonly currentDesignHash:      string;
	} | undefined;
	readonly treeUntouched: true;
}

/** The sc3 discriminated union — the `build` start-turn gate verdict. */
export type BuildAdmissionResult =
	| { readonly admitted: true;  readonly plan: BuildAdmissionAccepted }
	| { readonly admitted: false; readonly refusal: BuildAdmissionRefusal };

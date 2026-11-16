/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The `build` admission-gate verdict (sc3).
 *
 * In the controller-driven pivot the daemon no longer sequences Tasks or
 * seals a BuildArtifact — a capable controller LLM does the editing. All the
 * daemon owns at admission time is: is this Story's plan present, approved,
 * and fresh against its design.story? That question is answered by
 * `admitBuild` (see `admission.ts`), which returns the discriminated union
 * below.
 */

// ---------------------------------------------------------------------------
// sc3 — BuildAdmissionResult (the start-turn admission verdict)
//
// A discriminated union keyed on `admitted`:
//   - accepted → a THIN plan pointer (no PlanArtifact body embedded — siblings
//     re-resolve the plan from the pointer).
//   - refused  → a typed `BuildRefusalReason` + message +, for `plan-stale`
//     only, the inline drift hashes. `treeUntouched: true` is a STRUCTURAL
//     invariant: the gate is read-only and runs before any Task is touched.
//
// Non-throwing for all four modeled conditions (accepted / plan-missing /
// plan-unapproved / plan-stale).
// ---------------------------------------------------------------------------

/** The flat set of reasons the `build` admission gate refuses. */
export type BuildRefusalReason = 'plan-missing' | 'plan-unapproved' | 'plan-stale'
	/** A no-design (Trivial / small-bugfix) build whose epicHash has no approved ISSUE. */
	| 'no-head';

/** The thin accepted pointer — id + hash + storyId only, never the full
 *  PlanArtifact. Downstream re-resolves the plan from the id; the hash lets
 *  callers confirm they are on the admitted version. */
export interface BuildAdmissionAccepted {
	readonly planArtifactId:   string;
	readonly planArtifactHash: string;
	readonly storyId:          string;
}

/** The refusal member of sc3. `staleness` is an inline literal populated ONLY
 *  for `reason: 'plan-stale'`. `treeUntouched: true` is structural, not
 *  asserted. */
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

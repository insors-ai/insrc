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
 *
 * s3 adds the real per-Task contract types below the sc3 admission
 * gate: the daemon-produced verdict/outcome union (sc4) and the
 * one-subprocess-per-Task implementer seam (sc5).
 */

import type { PlanTask } from '../../artifacts/plan.js';

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

// ===========================================================================
// t1 — build schemas foundation (Story s3, Phase C)
//
// Purely-additive base types the rest of s3 builds on. No existing symbol
// is touched (migration step 1).
// ===========================================================================

/** The terminal status a Task lands in after the sequencer walks it. The
 *  first two are REACHED (an implementer ran and the daemon produced a
 *  verdict); the last two are UNREACHED (nothing ran — a blocked dependency
 *  or a halted run left no verdict to fabricate). */
export type BuildTaskStatus = 'completed' | 'failed' | 'blocked' | 'not-reached';

/** Fields common to every Task outcome, whether reached or not. Bound
 *  verbatim from the PlanTask (`taskId`/`title`/`dependsOn`) plus an optional
 *  human note. */
export interface BuildTaskCommon {
	readonly taskId:    string;                     // PlanTask id, verbatim from the approved plan
	readonly title:     string;
	readonly dependsOn: readonly string[];
	readonly note?:     string | undefined;
}

/** The daemon's OWN authoritative verdict for a Task's stated tests —
 *  produced by executing the test command extracted verbatim from the
 *  PlanTask (the approved artifact is the authorization boundary for what
 *  runs). It is the ONLY thing that advances a Task to a terminal status,
 *  and it is NEVER derived from the advisory `TaskImplementerReport`. Present
 *  on the `BuildTaskReached` arm only. */
export interface BuildTestVerdict {
	readonly command:  string;                      // from the PlanTask stated tests, verbatim
	readonly passed:   boolean;
	readonly exitCode: number;
	readonly summary:  string;
}

// ===========================================================================
// t2 — sc4 BuildTaskOutcome, the status-discriminated union (a2 reshape)
//
// Reshaped from the flat HLD interfaceSketch into a discriminated union so
// the load-bearing invariant — `filesTouched`/`testVerdict` are daemon-
// produced, NEVER self-reported — is enforced at the TYPE level: a
// blocked/not-reached Task literally has no field in which a fabricated
// verdict could sit. Carried by the accompanying amendment (migration
// step 2). See AMD-185807ba9a6b35d3-1 / the a2 alternative in the LLD.
// ===========================================================================

/** REACHED: an implementer subprocess ran and the daemon produced a verdict.
 *  REQUIRES the daemon-produced `testVerdict` plus `filesTouched` (the
 *  daemon's own working-tree diff) and the `attempts` the repair budget
 *  spent. A `status` of `'completed'` means the daemon verdict passed;
 *  `'failed'` means it did not (after the bounded repair budget). */
export interface BuildTaskReached extends BuildTaskCommon {
	readonly status:       'completed' | 'failed';
	readonly filesTouched: readonly string[];       // daemon working-tree diff
	readonly testVerdict:  BuildTestVerdict;         // REQUIRED — daemon test run
	readonly attempts:     number;
}

/** UNREACHED: nothing ran — a dependency did not complete (`'blocked'`) or
 *  the run halted on an earlier failed Task before this one was reached
 *  (`'not-reached'`). Carries NO `testVerdict` and NO `filesTouched`,
 *  because there was no diff and no test run to produce them. */
export interface BuildTaskUnreached extends BuildTaskCommon {
	readonly status: 'blocked' | 'not-reached';
}

/** sc4 — a Task's implementation outcome. Consumers narrow on `status` (or
 *  `'testVerdict' in outcome`) before reading the verdict/diff. */
export type BuildTaskOutcome = BuildTaskReached | BuildTaskUnreached;

// ===========================================================================
// t3 — sc5 seam types (TaskImplementerRequest / Report / Adapter)
//
// The quarantine boundary between the daemon's sequencing/verification and
// the one free-form CLI editing subprocess per Task. Types only; the
// concrete adapter is `adapter.ts` (t4) and the sequencer is `sequencer.ts`
// (t6) (migration step 3).
// ===========================================================================

/** The read-only context bundle handed to ONE implementer subprocess. The
 *  `task` is bound to the WORKFLOW `PlanTask` (`src/workflow/artifacts/plan.ts`
 *  — NOT the same-named `analyze/analyze-types.ts` interface). `maxAttempts`
 *  is the bounded per-Task repair budget (kept generous: giving up early
 *  produces a wrong `'failed'`). `completedDependencies` are finished
 *  outcomes provided for CONTEXT only. */
export interface TaskImplementerRequest {
	readonly task:                  PlanTask;
	readonly storyDesignMarkdown:   string;
	readonly planMarkdown:          string;
	readonly completedDependencies: readonly BuildTaskOutcome[];
	readonly repoRoot:              string;
	readonly maxAttempts:           number;
}

/** ADVISORY ONLY. The sequencer NEVER advances on this value — advancement
 *  is decided daemon-side from a real test run + working-tree diff. Kept
 *  deliberately two-field/minimal to reinforce the k2/sc5 quarantine: other
 *  Stories consume finished `BuildTaskOutcome` values and must never infer
 *  status from this narrative. */
export interface TaskImplementerReport {
	readonly claimedComplete: boolean;              // advisory; never trusted to advance
	readonly narrative:       string;
}

/** sc5 — the seam. `implement()` runs exactly ONE CliProvider subprocess to
 *  completion, serial by construction (never `Promise.all`'d). A subprocess
 *  or structured-output rejection propagates so the sequencer can treat it
 *  as an implementer failure — the daemon's own test run remains the sole
 *  authority for the Task's status. */
export interface TaskImplementerAdapter {
	/** Runs exactly one implementer subprocess to completion. Serial by construction. */
	implement(req: TaskImplementerRequest): Promise<TaskImplementerReport>;
}

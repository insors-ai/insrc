/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `build` workflow runners — Phase H (5th in the chain).
 *
 * Recipe (s1 SKELETON — a minimal, coherent set of llm-pause steps):
 *   s1: context.assemble  — read the approved plan (ordered Tasks) upstream
 *   s2: tasks.implement    — PLACEHOLDER outcome stub
 *
 * The upstream gate (`readBuildUpstream` → `requireApprovedPlan`) runs at
 * each step's prompt build, so an unapproved plan aborts the run before
 * any Task is touched — the approved plan is `build`'s authorization
 * boundary.
 *
 * SCOPE BOUNDARY: this file makes `build` a dispatchable, first-class
 * stage (registry membership + `workflow:'build'` tag). The heavy logic
 * is deferred:
 *   - TODO(s2): the full admission gate (plan freshness vs its LLD).
 *   - TODO(s3): real Task sequencing — delegate each Task's editing to a
 *     serial CliProvider subprocess while the daemon keeps sequencing.
 *   - TODO(s4): halt/report on a failing Task (test run + tree diff).
 *   - TODO(s5): the full BuildArtifact body + finalize.
 *
 * Mirrors `runners/plan/index.ts` in shape exactly (module-level
 * `registered` guard, `llmPauseRunner` helper, `registerRunner` calls,
 * each runner `workflow: 'build'`).
 */

import { createHash } from 'node:crypto';

import { registerRunner } from '../../executor.js';
import { readBuildUpstream } from '../../gates.js';
import { assertEpicHash } from '../../hash.js';
import { planArtifactId } from '../../storage.js';
import type { PlanArtifact } from '../../artifacts/plan.js';
import type { StepRunner, StepRunnerContext } from '../../types.js';
import { approvalVerdict, driftVerdict } from './admission.js';
import {
	buildContextSchema,
	tasksImplementSchema,
} from './schemas.js';
import type { BuildAdmissionResult } from './schemas.js';

export type {
	BuildAdmissionAccepted,
	BuildAdmissionRefusal,
	BuildAdmissionResult,
	BuildRefusalReason,
} from './schemas.js';

// ---------------------------------------------------------------------------
// Params helpers
// ---------------------------------------------------------------------------

function epicHashFrom(ctx: StepRunnerContext): string {
	const hash = ctx.intent.params['epicHash'];
	assertEpicHash(hash, `build requires intent.params.epicHash`);
	return hash;
}

function storyIdFrom(ctx: StepRunnerContext): string {
	const id = ctx.intent.params['storyId'];
	if (typeof id !== 'string' || id.length === 0) {
		throw new Error(`build requires intent.params.storyId`);
	}
	return id;
}

/** Read the approved plan (the ordered Tasks) `build` will implement.
 *  Throws (via the gate) when the plan is unusable. */
function upstream(ctx: StepRunnerContext): ReturnType<typeof readBuildUpstream> {
	return readBuildUpstream(ctx.intent.repoPath, epicHashFrom(ctx), storyIdFrom(ctx));
}

// ---------------------------------------------------------------------------
// Shared: llm-pause runner
// ---------------------------------------------------------------------------

function llmPauseRunner(spec: {
	readonly id:          string;
	readonly buildPrompt: (ctx: StepRunnerContext) => { readonly prompt: string; readonly userTurn: string };
	readonly schema:      Record<string, unknown>;
}): StepRunner {
	return {
		id:       spec.id,
		workflow: 'build',
		async run(ctx) {
			const { prompt, userTurn } = spec.buildPrompt(ctx);
			return { type: 'llm-pause', prompt, userTurn, schema: spec.schema, preparedBlob: { stepId: spec.id } };
		},
		async finalize(llmResponse) {
			return { type: 'output', output: llmResponse };
		},
	};
}

// ---------------------------------------------------------------------------
// s1 — context.assemble
// ---------------------------------------------------------------------------

const contextAssemble = llmPauseRunner({
	id: 'context.assemble',
	buildPrompt: (ctx) => {
		const { plan } = upstream(ctx);
		return {
			prompt: [
				'You are running the `context.assemble` step of the `build` workflow.',
				'',
				'The `build` stage implements ONE approved Story plan (a list of ordered,',
				'dependency-labelled Tasks) into code. This step is READ-ONLY discovery — do',
				'NOT edit any file or start implementing yet.',
				'',
				'What to do:',
				'  1. Read the approved plan below — its Tasks are the atomic units build will',
				'     implement one at a time, in `order`, respecting `dependsOn`.',
				'  2. Emit a compact BuildContext JSON: the Task count + a one-line summary of',
				'     the work ahead.',
			].join('\n'),
			userTurn: [
				`Focus: ${ctx.intent.focus}`,
				`Epic hash: ${epicHashFrom(ctx)}   Story: ${storyIdFrom(ctx)}`,
				'',
				'Approved plan (ordered Tasks to implement):',
				'```json',
				JSON.stringify(plan.body, null, 2),
				'```',
				'',
				'Emit the BuildContext JSON now.',
			].join('\n'),
		};
	},
	schema: buildContextSchema,
});

// ---------------------------------------------------------------------------
// s2 — tasks.implement  (PLACEHOLDER)
// ---------------------------------------------------------------------------

// TODO(s3): real Task sequencing — this step is a skeleton. The real
// implementation delegates each Task's editing to a serial CliProvider
// subprocess while the daemon sequences + verifies (test run + tree diff).
// TODO(s4): halt/report when a Task's verification fails.
const tasksImplement = llmPauseRunner({
	id: 'tasks.implement',
	buildPrompt: (ctx) => {
		const { plan } = upstream(ctx);
		return {
			prompt: [
				'You are running the `tasks.implement` step of the `build` workflow.',
				'',
				'SKELETON STEP (s1): record one `taskOutcomes[]` entry per plan Task with a',
				'`status` of `pending`. The real per-Task edit/test/repair loop is deferred to',
				'a later Story — do NOT attempt to implement anything here.',
			].join('\n'),
			userTurn: [
				's1 BuildContext:',
				'```json',
				JSON.stringify(ctx.stepOutputs['s1'], null, 2),
				'```',
				'',
				'Plan Tasks:',
				'```json',
				JSON.stringify(plan.body.tasks, null, 2),
				'```',
				'',
				'Emit the taskOutcomes JSON now.',
			].join('\n'),
		};
	},
	schema: tasksImplementSchema,
});

// ---------------------------------------------------------------------------
// s2 — admitBuild: the start-turn admission gate (sc3)
// ---------------------------------------------------------------------------

/** A stable identity hash of the resolved plan version being admitted.
 *  Honest content hash of the on-disk plan JSON (the object came from
 *  `JSON.parse`, so re-stringify preserves key order deterministically).
 *  Kept build-private — how the pointer's hash is derived is s2's alone. */
function planContentHash(plan: PlanArtifact): string {
	return createHash('sha256').update(JSON.stringify(plan)).digest('hex');
}

/** The `build` stage's read-only start-turn admission gate. Refuses to
 *  touch code when the Story's plan is missing, unapproved, or stale, and
 *  reports WHICH condition failed as a typed `BuildAdmissionResult` — never
 *  throwing for any of the four modeled conditions (accepted / plan-missing
 *  / plan-unapproved / plan-stale), mirroring `scanLldStaleness`'s return-a-
 *  typed-verdict discipline so `treeUntouched` is structural, not asserted.
 *
 *  Fixed evaluation order — approval BEFORE staleness — so:
 *    - a missing plan short-circuits to `plan-missing` (ac4), never a
 *      staleness verdict and never an empty admitted run;
 *    - an unapproved (or rejected) plan short-circuits to `plan-unapproved`
 *      (ac2), so an unapproved-AND-drifted plan yields the single reason
 *      `plan-unapproved` and the drift comparison is never computed;
 *    - only an approved plan reaches the drift check, which yields
 *      `plan-stale` (ac3, with the inline drift hashes) or admits (ac1).
 *
 *  Unmodeled errors — a malformed `epicHash` (via `assertEpicHash`), a
 *  corrupt plan body, or a missing CURRENT design.story — propagate rather
 *  than being remapped to a modeled reason.
 *
 *  `epicHash` is threaded in the same way the runners read
 *  `{epicHash, storyId}` from `intent.params` (the LLD's `admitBuild(repoPath,
 *  storyId)` assumed an internal `computeEpicHash` resolution that the real
 *  stage-agnostic call site does not have — the caller already carries the
 *  validated hash). */
export function admitBuild(repoPath: string, epicHash: string, storyId: string): BuildAdmissionResult {
	// Guard the hash up front so a malformed epicHash is a propagated
	// internal error, not a mis-reported `plan-missing`.
	assertEpicHash(epicHash, `admitBuild requires a well-formed epicHash`);

	const approval = approvalVerdict(repoPath, epicHash, storyId);
	if ('missing' in approval) {
		return {
			admitted: false,
			refusal: {
				reason:  'plan-missing',
				message:
					`Build refused for Story '${storyId}': no plan artifact exists (plan-missing). ` +
					`Run \`plan\` for Story '${storyId}' and approve it before build.`,
				treeUntouched: true,
			},
		};
	}
	if ('unapproved' in approval) {
		return {
			admitted: false,
			refusal: {
				reason:  'plan-unapproved',
				message:
					`Build refused for Story '${storyId}': the plan exists but is not approved ` +
					`(plan-unapproved). Approve the plan before build.`,
				treeUntouched: true,
			},
		};
	}

	// Approved — now the plan-vs-design.story drift check (ac3).
	const drift = driftVerdict(repoPath, epicHash, storyId, approval.plan);
	if ('stale' in drift) {
		return {
			admitted: false,
			refusal: {
				reason:  'plan-stale',
				message:
					`Build refused for Story '${storyId}': the plan is stale (plan-stale) — its recorded ` +
					`design.story basis (${short(drift.planRecordedDesignHash)}) differs from the current ` +
					`design.story (${short(drift.currentDesignHash)}). Re-run \`plan\` against the current LLD before build.`,
				staleness: {
					planRecordedDesignHash: drift.planRecordedDesignHash,
					currentDesignHash:      drift.currentDesignHash,
				},
				treeUntouched: true,
			},
		};
	}

	// Approved + fresh — admit with the THIN plan pointer (ac1).
	return {
		admitted: true,
		plan: {
			planArtifactId:   planArtifactId(epicHash, storyId),
			planArtifactHash: planContentHash(approval.plan),
			storyId,
		},
	};
}

/** Short display form for a hash inside a refusal message. */
function short(hash: string): string {
	return hash.length > 0 ? `${hash.slice(0, 12)}…` : '(empty)';
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerBuildRunners(): void {
	if (registered) return;
	registerRunner(contextAssemble);
	registerRunner(tasksImplement);
	registered = true;
}

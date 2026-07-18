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

import { registerRunner } from '../../executor.js';
import { readBuildUpstream } from '../../gates.js';
import { assertEpicHash } from '../../hash.js';
import type { StepRunner, StepRunnerContext } from '../../types.js';
import {
	buildContextSchema,
	tasksImplementSchema,
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
// Registration
// ---------------------------------------------------------------------------

let registered = false;

export function registerBuildRunners(): void {
	if (registered) return;
	registerRunner(contextAssemble);
	registerRunner(tasksImplement);
	registered = true;
}

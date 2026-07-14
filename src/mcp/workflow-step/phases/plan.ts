/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_workflow_step` phase='plan' handler.
 *
 * The client emitted a WorkflowPlan. We:
 *   1. Sanity-check the plan (workflow name matches; steps non-empty).
 *   2. Kick off the executor.
 *   3. If it ran to completion (all steps deterministic), transition
 *      to `awaiting_synthesize` and emit the synthesizer prompt.
 *   4. If it paused on an llm-pause, transition to
 *      `awaiting_llm_step` and emit the runner's prompt + schema.
 *   5. On any executor error, return `next: 'error'`.
 */

import { getLogger } from '../../../shared/logger.js';
import { startRun } from '../../../workflow/executor.js';
import { prepareSynthesize } from '../../../workflow/orchestrator.js';
import { assertStage, decodeState, encodeState, STATE_VERSION, type WorkflowStepStatePayload } from '../state.js';
import type {
	WorkflowStepEmitStep,
	WorkflowStepEmitSynthesize,
	WorkflowStepError,
	WorkflowStepInputPlan,
} from '../types.js';

const log = getLogger('mcp:workflow-step:plan');

export async function handlePlan(
	input: WorkflowStepInputPlan,
): Promise<WorkflowStepEmitStep | WorkflowStepEmitSynthesize | WorkflowStepError> {
	const state = decodeState(input.state);
	assertStage(state, 'awaiting_plan');

	if (input.plan.workflow !== state.intent.workflow) {
		return errorResult(
			'plan-workflow-mismatch',
			`plan.workflow ('${input.plan.workflow}') != intent.workflow ('${state.intent.workflow}')`,
			false,
		);
	}
	if (input.plan.steps.length === 0) {
		return errorResult('empty-plan', `plan.steps is empty`, false);
	}

	const tick = await startRun(state.intent, input.plan, state.runId, state.epicKey);
	log.info(
		{ runId: state.runId, workflow: state.intent.workflow, tickType: tick.type },
		'insrc_workflow_step[plan]: executor tick',
	);

	if (tick.type === 'error') {
		return errorResult(tick.code, `step '${tick.stepId}': ${tick.message}`, tick.retryable);
	}
	if (tick.type === 'paused') {
		const pause = tick.state.pause!;
		const next: WorkflowStepStatePayload = {
			version:     STATE_VERSION,
			runId:       state.runId,
			epicKey:     state.epicKey,
			startedAtMs: state.startedAtMs,
			intent:      state.intent,
			executor:    tick.state,
			stage:       'awaiting_llm_step',
		};
		return {
			next:     'emit_step',
			guidance:
				`Emit the JSON matching the schema below, then call ` +
				`insrc_workflow_step again with phase="step", stepId="${pause.stepId}", ` +
				`response=<your JSON>, state=<the state field verbatim>.`,
			stepId:   pause.stepId,
			runner:   pause.runner,
			prompt:   pause.prompt,
			userTurn: pause.userTurn,
			schema:   pause.schema,
			state:    encodeState(next),
		};
	}
	// complete — all deterministic. Prepare the synthesizer.
	const prepared = prepareSynthesize(state.intent, tick.stepOutputs);
	const next: WorkflowStepStatePayload = {
		version:     STATE_VERSION,
		runId:       state.runId,
		epicKey:     state.epicKey,
		startedAtMs: state.startedAtMs,
		intent:      state.intent,
		stepOutputs: tick.stepOutputs,
		stage:       'awaiting_synthesize',
	};
	return {
		next:     'emit_synthesize',
		guidance:
			`Emit the artifact JSON matching the schema below, then call ` +
			`insrc_workflow_step again with phase="synthesize", artifact=<your JSON>, ` +
			`state=<the state field verbatim>.`,
		prompt:   prepared.systemPrompt,
		userTurn: prepared.userTurn,
		schema:   prepared.schema,
		state:    encodeState(next),
	};
}

function errorResult(code: string, message: string, retryable: boolean): WorkflowStepError {
	return { next: 'error', error: { code, message, retryable } };
}

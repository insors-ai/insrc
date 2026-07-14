/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_workflow_step` phase='step' handler.
 *
 * The client emitted the LLM turn for the runner that paused. We:
 *   1. Look up the executor state; verify it's paused on the right
 *      step (cross-check `input.stepId` vs `state.executor.pause.stepId`).
 *   2. Resume the executor with the LLM's structured response.
 *   3. Same fork as `phase='plan'`: if the resumed run pauses again,
 *      emit another `emit_step`; if it completes, emit `emit_synthesize`.
 */

import { getLogger } from '../../../shared/logger.js';
import { resumeRun } from '../../../workflow/executor.js';
import { prepareSynthesize } from '../../../workflow/orchestrator.js';
import { assertStage, decodeState, encodeState, STATE_VERSION, type WorkflowStepStatePayload } from '../state.js';
import type {
	WorkflowStepEmitStep,
	WorkflowStepEmitSynthesize,
	WorkflowStepError,
	WorkflowStepInputStep,
} from '../types.js';

const log = getLogger('mcp:workflow-step:step');

export async function handleStep(
	input: WorkflowStepInputStep,
): Promise<WorkflowStepEmitStep | WorkflowStepEmitSynthesize | WorkflowStepError> {
	const state = decodeState(input.state);
	assertStage(state, 'awaiting_llm_step');

	if (state.executor === undefined || state.executor.pause === undefined) {
		return errorResult(
			'no-executor-pause',
			`state stage is 'awaiting_llm_step' but executor is not paused`,
			false,
		);
	}
	if (state.executor.pause.stepId !== input.stepId) {
		return errorResult(
			'step-id-mismatch',
			`phase='step' claims stepId='${input.stepId}' but executor is paused on '${state.executor.pause.stepId}'`,
			false,
		);
	}

	const tick = await resumeRun(state.executor, input.response, state.epicKey);
	log.info(
		{ runId: state.runId, tickType: tick.type, stepId: input.stepId },
		'insrc_workflow_step[step]: executor tick',
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
	// complete
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

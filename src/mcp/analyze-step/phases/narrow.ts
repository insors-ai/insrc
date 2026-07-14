/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_analyze_step` phase='narrow' handler.
 *
 * The outer client's LLM just produced the JSON output of a narrow-
 * LLM exploration that the plan phase paused on. We:
 *
 * 1. Decode + stage-check the state blob (expected: awaiting_narrow).
 * 2. Cross-check that the explorationId the client echoed back matches
 *    the paused exploration (defence against a stale state blob).
 * 3. Look up the narrow runner's finalize() and apply it against the
 *    `preparedBlob` we stashed at pause time + the raw output.
 * 4. Cache the finalized ExplorationOutput (same key as the one-shot
 *    executor uses).
 * 5. Re-enter stepPlan with the resume state -- adds the finalized
 *    output for the paused exp and continues from the next
 *    exploration. May pause again on another narrow-LLM exp.
 * 6. If stepPlan hits another pause -> return emit_narrow.
 *    If stepPlan completes -> load synthesizer prompt/schema and
 *    return emit_bundle.
 */

import { getNarrowRunner, stepPlan } from '../../../analyze/explore/index.js';
import { putCachedExploration } from '../../../db/exploration-cache.js';
import { getLogger } from '../../../shared/logger.js';
import { prepareSynthesize } from '../../../analyze/context/synthesizer.js';

import {
	assertStage,
	decodeState,
	encodeState,
	StepStateDecodeError,
	STATE_VERSION,
	type StepStatePayload,
} from '../state.js';
import type {
	StepInputNarrow,
	StepOutputEmitBundle,
	StepOutputEmitNarrow,
	StepOutputError,
} from '../types.js';

const log = getLogger('mcp:analyze-step:narrow');

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function handleNarrow(
	input: StepInputNarrow,
): Promise<StepOutputEmitBundle | StepOutputEmitNarrow | StepOutputError> {
	// (1) Decode + stage-check.
	let state: StepStatePayload;
	try {
		state = decodeState(input.state);
		assertStage(state, 'awaiting_narrow');
	} catch (err) {
		if (err instanceof StepStateDecodeError) {
			return errorResult('state-decode', err.message, err.code !== 'malformed');
		}
		throw err;
	}

	if (state.narrow === undefined || state.plan === undefined) {
		return errorResult(
			'state-inconsistent',
			'awaiting_narrow stage but state carries no narrow-pause payload / plan; ' +
			'restart with phase=start.',
			false,
		);
	}

	// (2) Cross-check the client's echoed explorationId.
	if (input.explorationId !== state.narrow.explorationId) {
		return errorResult(
			'wrong-exploration',
			`client echoed explorationId='${input.explorationId}' but the pause ` +
			`is on exploration='${state.narrow.explorationId}'. ` +
			`Retry with the explorationId from the prior emit_narrow response.`,
			true,
		);
	}

	// (3) Finalize the narrow output through the runner's finalize().
	const narrowRunner = getNarrowRunner(state.narrow.explorationType);
	if (narrowRunner === undefined) {
		return errorResult(
			'unknown-narrow-runner',
			`No narrow finalize handler for exploration type ` +
			`'${state.narrow.explorationType}'. Server / client version mismatch?`,
			false,
		);
	}

	let finalizedOutput;
	try {
		finalizedOutput = narrowRunner.finalize(
			state.narrow.preparedBlob,
			input.narrow,
			state.runId,
		);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		log.warn(
			{
				runId:           state.runId,
				explorationId:   state.narrow.explorationId,
				explorationType: state.narrow.explorationType,
				err:             msg,
			},
			'insrc_analyze_step[narrow]: finalize threw',
		);
		return errorResult(
			'narrow-finalize',
			`Finalize threw on narrow output for exploration ` +
			`'${state.narrow.explorationId}' (${state.narrow.explorationType}): ${msg}. ` +
			`Emit a JSON payload matching the schema from the prior emit_narrow ` +
			`response and retry with the SAME state.`,
			true,
		);
	}

	// (4) Cache the finalized output (same key executePlan uses).
	//     Requires locating the paused exploration in the plan.
	const pausedExp = state.plan.explorations.find(e => e.id === state.narrow!.explorationId);
	if (pausedExp !== undefined) {
		try {
			await putCachedExploration(
				state.repoPath,
				BigInt(state.repoIndexedAt ?? 0),
				pausedExp,
				finalizedOutput,
			);
		} catch (err) {
			log.warn(
				{ runId: state.runId, err: (err as Error).message },
				'insrc_analyze_step[narrow]: cache put failed; continuing',
			);
		}
	}

	// (5) Continue stepPlan from the resume state, injecting the just-
	//     finalized output.
	const carriedOutputs = state.narrow.resumeState.outputs.slice();
	carriedOutputs.push({
		id:     state.narrow.explorationId,
		output: finalizedOutput,
	});
	const carriedResults = state.narrow.resumeState.results.slice();
	carriedResults.push({
		exploration: pausedExp ?? { id: state.narrow.explorationId, type: state.narrow.explorationType, purpose: '', params: {} },
		output:      finalizedOutput,
		cached:      false,
		elapsedMs:   0,   // pause-to-resume wall clock lives outside our timer; report 0
	});

	log.info(
		{
			runId:           state.runId,
			explorationId:   state.narrow.explorationId,
			explorationType: state.narrow.explorationType,
			priorResults:    carriedResults.length,
		},
		'insrc_analyze_step[narrow]: finalized; resuming stepPlan',
	);

	const step = await stepPlan({
		runId:               state.runId,
		repoPath:            state.repoPath,
		closureRepos:        [state.repoPath],
		repoLastIndexedAtMs: BigInt(state.repoIndexedAt ?? 0),
		plan:                state.plan,
		resumeState: {
			results:      carriedResults,
			outputs:      carriedOutputs,
			totalCached:  state.narrow.resumeState.totalCached,
			totalMsSoFar: state.narrow.resumeState.totalMsSoFar,
		},
	});

	if (step.kind === 'pending') {
		// Another narrow exploration paused; emit another emit_narrow.
		const pauseState: StepStatePayload = {
			version:        STATE_VERSION,
			runId:          state.runId,
			repoPath:       state.repoPath,
			repoIndexedAt:  state.repoIndexedAt,
			intent:         state.intent,
			synthesizerKey: state.synthesizerKey,
			plan:           state.plan,
			narrow: {
				explorationId:   step.explorationId,
				explorationType: step.explorationType,
				preparedBlob:    step.preparedBlob,
				resumeState:     step.resumeState,
			},
			stage:          'awaiting_narrow',
		};
		return {
			next:            'emit_narrow',
			guidance:
				`Emit the JSON matching the schema below (this is the output of a ` +
				`${step.explorationType} exploration), then call insrc_analyze_step ` +
				`again with phase="narrow", explorationId="${step.explorationId}", ` +
				`narrow=<your JSON>, state=<the state field verbatim>.`,
			prompt:          step.systemPrompt,
			userTurn:        step.userTurn,
			schema:          step.schema as unknown as Record<string, unknown>,
			state:           encodeState(pauseState),
			explorationId:   step.explorationId,
			explorationType: step.explorationType,
		};
	}

	// step.kind === 'done' -- emit_bundle
	const executed = step.executed;
	const prepared = prepareSynthesize({
		intent:   state.intent,
		executed,
		target:   state.synthesizerKey,
	});

	const nextState: StepStatePayload = {
		version:        STATE_VERSION,
		runId:          state.runId,
		repoPath:       state.repoPath,
		repoIndexedAt:  state.repoIndexedAt,
		intent:         state.intent,
		synthesizerKey: state.synthesizerKey,
		plan:           state.plan,
		executed,
		stage:          'awaiting_bundle',
	};

	log.info(
		{
			runId:            state.runId,
			explorationCount: executed.results.length,
			totalMs:          executed.totalMs,
		},
		'insrc_analyze_step[narrow]: plan complete; emitting synthesizer prompt',
	);

	return {
		next:     'emit_bundle',
		guidance:
			'Compose the AnalyzeContextBundle JSON matching the schema below, then ' +
			'call insrc_analyze_step again with phase="bundle", bundle=<your JSON>, ' +
			'state=<the state field verbatim>.',
		prompt:   prepared.systemPrompt,
		userTurn: prepared.userTurn,
		schema:   prepared.schema as Record<string, unknown>,
		state:    encodeState(nextState),
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResult(code: string, message: string, retryable: boolean): StepOutputError {
	return {
		next:  'error',
		error: { code, message, retryable },
	};
}

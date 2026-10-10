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

import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { failedOutput, getNarrowRunner, stepPlan } from '../../../analyze/explore/index.js';
import type { Exploration, ExplorationOutput } from '../../../analyze/explore/index.js';
import { putCachedExploration } from '../../../db/exploration-cache.js';
import { getLogger } from '../../../shared/logger.js';
import { stepScope } from '../scope.js';
import { prepareAnswerTurn } from '../answer-turn.js';
import { measureLookupResults } from '../../../analyze/measure.js';

import {
	assertStage,
	decodeState,
	reencodeState,
	StepStateDecodeError,
	STATE_VERSION,
	type StepStatePayload,
} from '../state.js';
import type {
	StepErrorData,
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

	// (3a) The answer is the AGENT's. Check it against the lookup's schema
	//      before finalize is called: an answer that does not fit is the
	//      agent's to correct, with the same state. (No finalize checks its
	//      input, so a malformed answer used to surface as a TypeError that
	//      could not be told from a failure of the lookup.) A lookup that
	//      accepts no answer at all is passed one through unchecked.
	const noAnswer = input.narrow === null || input.narrow === undefined;
	if (!(noAnswer && narrowRunner.acceptsNoAnswer === true)) {
		const check = validateAgainstSchema(narrowRunner.schema, input.narrow);
		if (!check.ok) {
			log.warn(
				{
					runId:           state.runId,
					explorationId:   state.narrow.explorationId,
					explorationType: state.narrow.explorationType,
					errors:          check.errors,
				},
				'insrc_analyze_step[narrow]: the narrow answer does not match the schema',
			);
			return errorResult(
				'narrow-finalize',
				`The narrow output for exploration '${state.narrow.explorationId}' ` +
				`(${state.narrow.explorationType}) does not match its schema: ${check.errors.join('; ')}. ` +
				`Emit a JSON payload matching the schema from the prior emit_narrow ` +
				`response and retry with the SAME state.`,
				true,
			);
		}
	}

	// (3b) Finalize. A throw here is the lookup failing, not the agent's
	//      answer: it becomes the failed output for this lookup, and the run
	//      goes on to the next one.
	const pausedExp = state.plan.explorations.find(e => e.id === state.narrow!.explorationId);
	const expForOutput: Exploration = pausedExp
		?? { id: state.narrow.explorationId, type: state.narrow.explorationType, purpose: '', params: {} };
	let finalizedOutput: ExplorationOutput;
	try {
		finalizedOutput = narrowRunner.finalize(
			state.narrow.preparedBlob,
			input.narrow,
			state.runId,
		);
	} catch (err) {
		log.warn(
			{
				runId:           state.runId,
				explorationId:   state.narrow.explorationId,
				explorationType: state.narrow.explorationType,
				err:             err instanceof Error ? err.message : String(err),
			},
			'insrc_analyze_step[narrow]: finalize threw; the lookup is recorded as failed',
		);
		finalizedOutput = failedOutput(expForOutput, err);
	}

	// (4) Cache the finalized output (same key executePlan uses). A failed
	//     output is never cached: the cache holds successful outputs only, and
	//     a stored failure would be served to every later run.
	if (pausedExp !== undefined && finalizedOutput.type !== 'failed') {
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
		exploration: expForOutput,
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

	// The token carries the intent, not a resolved scope: resolve it again.
	const scope = await stepScope(state.intent);
	const step = await stepPlan({
		runId:               state.runId,
		repoPath:            scope.lookupPath,
		closureRepos:        [scope.lookupPath],
		scope,
		repoLastIndexedAtMs: BigInt(state.repoIndexedAt ?? 0),
		// The request's size as the start phase measured it, for a lookup that sizes its own work.
		requestSize:         state.intent.scope,
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
			...(state.sizeHint !== undefined ? { sizeHint: state.sizeHint } : {}),
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
			state:           reencodeState(input.state, pauseState),
			explorationId:   step.explorationId,
			explorationType: step.explorationType,
		};
	}

	// step.kind === 'done' -- emit_bundle
	const executed = step.executed;
	// A missing answer prompt is reported with what the lookups found, not thrown.
	// The size the answer turn is given is measured from what the lookups returned,
	// with the caller's stated size as the hint.
	const measure = measureLookupResults(executed.results, state.sizeHint);
	const turn = prepareAnswerTurn({
		intent:   { ...state.intent, scope: measure.size },
		executed,
		measure,
		target:   state.synthesizerKey,
	});
	// Not retryable: the file will still be missing on the next call.
	if (!turn.ok) return errorResult(turn.code, turn.message, false, turn.data);
	const prepared = turn.prepared;

	const nextState: StepStatePayload = {
		version:        STATE_VERSION,
		runId:          state.runId,
		repoPath:       state.repoPath,
		repoIndexedAt:  state.repoIndexedAt,
		intent:         state.intent,
		...(state.sizeHint !== undefined ? { sizeHint: state.sizeHint } : {}),
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
		state:    reencodeState(input.state, nextState),
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** `data` is set by one error only: a missing answer prompt after the lookups ran. */
function errorResult(code: string, message: string, retryable: boolean, data?: StepErrorData): StepOutputError {
	return {
		next:  'error',
		error: data !== undefined ? { code, message, retryable, data } : { code, message, retryable },
	};
}

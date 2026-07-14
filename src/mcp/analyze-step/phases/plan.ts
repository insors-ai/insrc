/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_analyze_step` phase='plan' handler.
 *
 * The outer client just emitted an ExplorationPlan JSON. We:
 *
 * 1. Decode + stage-check the state blob.
 * 2. Re-validate the plan against DECOMPOSE_SCHEMA (defensive: the
 *    tool schema constrained the top-level shape but not the id
 *    ordering / dependsOn topology).
 * 3. Execute the plan via the existing executePlan primitive. In
 *    Phase A this uses the server-side shaperProvider for any
 *    narrow-LLM explorations (doc.decision.trace, capability.reuse-
 *    check verdict, etc.). Structural-map recipes are pure-
 *    deterministic and use zero server-side LLM.
 * 4. Refine the synthesizer key from the emitted plan's answerType
 *    (code + adherence-check -> 'adherence', etc.).
 * 5. Load the synthesizer prompt + schema for the refined key via
 *    prepareSynthesize.
 * 6. Update the state blob to stage='awaiting_bundle', include the
 *    plan + executed results.
 * 7. Return emit_bundle.
 */

import {
	finalizeDecompose,
	DecomposerSchemaUnrecoverable,
} from '../../../analyze/context/decomposer.js';
import { prepareSynthesize } from '../../../analyze/context/synthesizer.js';
import { stepPlan } from '../../../analyze/explore/index.js';
import { getLogger } from '../../../shared/logger.js';

import {
	assertStage,
	decodeState,
	encodeState,
	StepStateDecodeError,
	STATE_VERSION,
	type StepStatePayload,
} from '../state.js';
import { refineSynthesizerKey } from '../synthesizer-key.js';
import type {
	StepInputPlan,
	StepOutputEmitBundle,
	StepOutputEmitNarrow,
	StepOutputError,
} from '../types.js';

const log = getLogger('mcp:analyze-step:plan');

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function handlePlan(
	input: StepInputPlan,
): Promise<StepOutputEmitBundle | StepOutputEmitNarrow | StepOutputError> {
	// (1) Decode + stage-check.
	let state: StepStatePayload;
	try {
		state = decodeState(input.state);
		assertStage(state, 'awaiting_plan');
	} catch (err) {
		if (err instanceof StepStateDecodeError) {
			return errorResult('state-decode', err.message, err.code !== 'malformed');
		}
		throw err;
	}

	// (2) Defensive plan validation. The tool schema pinned the top-
	// level shape; finalizeDecompose runs ajv + topology check.
	let validatedPlan;
	try {
		validatedPlan = finalizeDecompose(input.plan);
	} catch (err) {
		if (err instanceof DecomposerSchemaUnrecoverable) {
			log.warn(
				{
					runId:       state.runId,
					err:         err.message,
					// Preview the client's plan so we can see what shape
					// it emitted when validation trips.
					planPreview: JSON.stringify(input.plan ?? null).slice(0, 800),
				},
				'insrc_analyze_step[plan]: client-emitted plan failed schema/topology',
			);
			return errorResult(
				'plan-schema',
				`emitted plan failed schema / topology validation: ${err.message}. ` +
				`Fix the JSON and call phase='plan' again with the corrected plan + the ` +
				`SAME state token. Do NOT restart with phase='start' -- the state is ` +
				`still valid for a retry.`,
				true,   // retryable=true so the client re-emits the plan against the same state
			);
		}
		throw err;
	}

	// (3) Execute via the multi-turn stepPlan. Deterministic
	// explorations run inline through the same runner + cache logic as
	// executePlan; narrow-LLM explorations PAUSE here and return an
	// emit_narrow envelope so the outer client's LLM produces the
	// narrow output.
	const step = await stepPlan({
		runId:               state.runId,
		repoPath:            state.repoPath,
		closureRepos:        [state.repoPath],
		repoLastIndexedAtMs: BigInt(state.repoIndexedAt ?? 0),
		plan:                validatedPlan,
	});

	// (4) Refine synthesizer key from answerType (needed either way so
	// we can bake it into the pause state or the bundle state).
	const synthesizerKey = refineSynthesizerKey(
		state.intent.target,
		validatedPlan.answerType,
	);

	if (step.kind === 'pending') {
		// Multi-turn stepPlan hit a narrow-LLM exploration. Emit
		// emit_narrow with the prompt + schema; carry the resume state
		// forward so handleNarrow can finalize on the next call.
		const pauseState: StepStatePayload = {
			version:        STATE_VERSION,
			runId:          state.runId,
			repoPath:       state.repoPath,
			repoIndexedAt:  state.repoIndexedAt,
			intent:         state.intent,
			synthesizerKey,
			plan:           validatedPlan,
			narrow: {
				explorationId:   step.explorationId,
				explorationType: step.explorationType,
				preparedBlob:    step.preparedBlob,
				resumeState:     step.resumeState,
			},
			stage:          'awaiting_narrow',
		};

		log.info(
			{
				runId:           state.runId,
				pausedExpId:     step.explorationId,
				pausedExpType:   step.explorationType,
				priorResults:    step.resumeState.results.length,
			},
			'insrc_analyze_step[plan]: paused on narrow-LLM exploration',
		);

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

	// step.kind === 'done'
	const executed = step.executed;

	// (5) Load synthesizer prompt + schema.
	const prepared = prepareSynthesize({
		intent:   state.intent,
		executed,
		target:   synthesizerKey,
	});

	// (6) Update state.
	const nextState: StepStatePayload = {
		version:        STATE_VERSION,
		runId:          state.runId,
		repoPath:       state.repoPath,
		repoIndexedAt:  state.repoIndexedAt,
		intent:         state.intent,
		synthesizerKey,
		plan:           validatedPlan,
		executed,
		stage:          'awaiting_bundle',
	};

	log.info(
		{
			runId:            state.runId,
			answerType:       validatedPlan.answerType,
			explorationCount: executed.results.length,
			synthesizerKey,
			totalMs:          executed.totalMs,
		},
		'insrc_analyze_step[plan]: executed; emitting synthesizer prompt',
	);

	// (7) Return emit_bundle.
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

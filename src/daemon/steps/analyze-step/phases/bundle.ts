import { captureAnalysisDiagnostics } from '../../../../analyze/connection-access.js';
import { connectionExecutionErrorCode, ConnectionExecutionError } from '../../../../shared/step-context.js';
import { beginSessionReuse, assertSessionReuseNow } from '../../../../analyze/session-reuse.js';
import { assertAnalysisAudience } from '../../analysis-admission.js';
import type { ConnectionExecutionContext } from '../../../../shared/step-context.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_analyze_step` phase='bundle' handler.
 *
 * The outer client just emitted an AnalyzeContextBundle JSON. We:
 *
 * 1. Decode + stage-check the state blob.
 * 2. Defensively re-validate the bundle against the stripped bundle
 *    schema (via finalizeSynthesize).
 * 3. Stamp meta from framework-side info (mode, shaper, toolCalls,
 *    emptyLayers, schemaVersion, repoLastIndexedAt).
 * 4. Render as markdown for the client's response.
 * 5. Return done.
 *
 * Phase A does NOT write to the one-shot bundle cache. Phase B may
 * add a step-specific cache path so repeat runs skip the whole
 * loop; see docs/plans/mcp-multi-turn-analyze.md for the rationale.
 */

import {
	finalizeSynthesize,
	prepareSynthesize,
	SynthesizerSchemaUnrecoverable,
} from '../../../../analyze/context/synthesizer.js';
import { SCHEMA_VERSION } from '../../../../analyze/context/schema.js';
import { getLogger } from '../../../../shared/logger.js';
import { applyHandling } from '../../../../analyze/completeness.js';
import type { HandlingReport } from '../../../../analyze/completeness.js';
import { admitTurn, handlingOf, recordInvalid } from '../../../../analyze/context/answer-progress.js';
import type { AnswerProgress, FinalizedAnswerTurn } from '../../../../analyze/context/answer-progress.js';
import { ShaperAnswerStepFailedError } from '../../../../analyze/context/driver.js';
import { loadAnalyzeConfig } from '../../../../config/analyze.js';
import { ANSWER_STEP_FAILED, turnOutput } from '../answer-turn.js';

import { renderBundleAsMarkdown } from '../../bundle-md.js';
import {
	assertStage,
	decodeState,
	reencodeState,
	StepStateDecodeError,
	type StepStatePayload,
} from '../state.js';
import { releaseState } from '../state-store.js';
import type {
	StepErrorData,
	StepInputBundle,
	StepOutputDone,
	StepOutputEmitBundle,
	StepOutputEmitCombine,
	StepOutputEmitPart,
	StepOutputError,
} from '../types.js';
import type {
	AnalyzeContextBundle,
	BundleLayerName,
	BundleMeta,
	ShaperId,
} from '../../../../analyze/context/types.js';
import type { BundleLayers } from '../../../../analyze/context/driver.js';
import { reportFromLookups } from '../../../../analyze/explore/answer-report.js';
import { measureLookupResults } from '../../../../analyze/measure.js';
import { withSubsystemContext } from '../../../../analyze/context/subsystem-context.js';

const log = getLogger('mcp:analyze-step:bundle');

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export async function handleBundle(
	input: StepInputBundle,
	execution?: ConnectionExecutionContext,
): Promise<StepOutputDone | StepOutputError | StepOutputEmitBundle | StepOutputEmitPart | StepOutputEmitCombine> {
	assertAnalysisAudience(execution);
	await beginSessionReuse(execution);
	assertSessionReuseNow(execution);
	// (1) Decode + stage-check.
	let state: StepStatePayload;
	try {
		state = await decodeState(input.state, execution);
		assertSessionReuseNow(execution);
		assertStage(state, 'awaiting_bundle');
	} catch (err) {
		if (execution?.mode === 'session-memory') { const code = connectionExecutionErrorCode(err); if (code) throw new ConnectionExecutionError(code); return errorResult('state-decode', 'Temporary analysis continuation is unavailable.', false); }
		if (err instanceof StepStateDecodeError) {
			return errorResult('state-decode', err.message, err.code !== 'malformed');
		}
		throw err;
	}

	// (1a) An answer written in parts: the reply is for the pending part or combine. A state minted before parts
	// existed carries no progress and is read as a single reply.
	const answer = state.answer;
	let handling: HandlingReport | undefined = answer !== undefined && answer.mode === 'single' ? handlingOf(answer) : undefined;
	let preset: BundleLayers | undefined;
	if (answer !== undefined && answer.mode === 'partitioned' && answer.pending !== undefined) {
		const turned = await handlePartReply(input, state, answer, execution);
		if ('output' in turned) return turned.output;
		preset = turned.layers;
		handling = turned.handling;
	}

	// (2) Validate the bundle layers.
	let layers: BundleLayers;
	try {
		layers = preset ?? finalizeSynthesize(input.bundle, execution);
	} catch (err) {
		const temporary = execution?.mode === 'session-memory';
		if (temporary) { const code = connectionExecutionErrorCode(err); if (code) throw new ConnectionExecutionError(code); }
		if (err instanceof SynthesizerSchemaUnrecoverable) {
			// A temporary request is told no more than that the bundle is invalid; the wording of the schema errors stays out.
			const said = temporary ? 'Temporary analysis bundle is invalid.' : err.message;
			// A state with progress asks the same turn again, with a new token and a retry note, up to the retry bound;
			// past it the state is released and the failure is final. A state without progress keeps the error it always had.
			if (answer !== undefined && answer.mode === 'single' && state.executed !== undefined) {
				const bound = loadAnalyzeConfig().shaper.structuredOutputRetries;
				if (answer.retries + 1 < bound) {
					const progress: AnswerProgress = { ...answer, retries: answer.retries + 1 };
					const prepared = prepareSynthesize({
						intent: { ...state.intent, scope: measureLookupResults(state.executed.results, state.sizeHint).size },
						executed: state.executed, target: state.synthesizerKey,
					});
					const token = await reencodeState(input.state, { ...state, answer: progress }, execution);
					return turnOutput(prepared, undefined, token, { attempt: progress.retries, reason: said });
				}
				await releaseState(input.state, execution);
				return errorResult('bundle-schema', temporary ? said : `emitted bundle failed schema validation after ${bound} attempts: ${said}.`, false);
			}
			if (temporary) return errorResult('bundle-schema', said, true);
			return errorResult(
				'bundle-schema',
				`emitted bundle failed schema validation: ${err.message}. ` +
				`Re-emit a bundle matching the schema in the prior tool response.`,
				true,
			);
		}
		if (temporary) return errorResult('bundle-schema', 'Temporary analysis bundle is invalid.', true);
		throw err;
	}

	// (3) Stamp meta. toolCalls counts the deterministic + narrow-LLM
	// steps the server actually executed on the client's behalf.
	// modelId='client' captures that the outer LLM authored the
	// bundle content.
	const meta: BundleMeta = {
		mode:          'run',
		shaper:        deriveShaperId(state.intent.target),
		toolCalls:     state.executed?.results.length ?? 0,
		modelId:       'client',
		emptyLayers:   deriveEmptyLayers(layers),
		schemaVersion: SCHEMA_VERSION,
		...(state.repoIndexedAt !== null
			? { repoLastIndexedAt: state.repoIndexedAt }
			: {}),
	};
	// (3a) The answer report: derived HERE from the lookups this run executed.
	// The agent writes the seven layers and nothing else; a bundle in which it
	// supplied a `report` was already rejected above as 'bundle-schema',
	// because the schema it was given has no such field.
	// Its measure is taken from the same results, with the caller's stated size as the hint.
	const results = state.executed?.results ?? [];
	const derived = reportFromLookups(results, measureLookupResults(results, state.sizeHint), { ref: state.intent.scopeRef, source: state.intent.scopeSource });
	// How the answer was written is added by code: the client's own account of it is never used.
	const report = handling !== undefined ? applyHandling(derived, handling) : derived;
	// (3b) The subsystems of the scope and of the files the bundle cites (Epic
	// c2ba6fa6 s8), from the stored subsystem rows, as runShaper's bundles carry them.
	const scopeRef = state.intent.scopeRef;
	const bundle: AnalyzeContextBundle = await withSubsystemContext(
		{ ...layers, meta, report },
		state.repoPath,
		scopeRef.kind === 'module' || scopeRef.kind === 'file' ? scopeRef.value : undefined,
	);

	// (4) Render.
	const markdown = renderBundleAsMarkdown(bundle);

	captureAnalysisDiagnostics(log, execution).emit('info', () => [{
			runId:            state.runId,
			target:           state.intent.target,
			explorationCount: state.executed?.results.length ?? 0,
			summaryLen:       layers.summary.length,
			structureLen:     layers.structure.length,
			artefactsLen:     layers.artefacts.length,
	}, 'insrc_analyze_step[bundle]: run complete']);

	// Run completed -- drop the state entry so a busy MCP subprocess
	// doesn't accumulate finished-run payloads.
	await releaseState(input.state, execution);

	return {
		next:     'done',
		markdown,
		meta,
		report,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function errorResult(code: string, message: string, retryable: boolean, data?: StepErrorData): StepOutputError {
	return {
		next:  'error',
		error: data !== undefined ? { code, message, retryable, data } : { code, message, retryable },
	};
}

/**
 * A reply to a part or a combine. Either the answer is finished (its layers and how it was handled), or the next turn is
 * asked (a new state token, the next part or combine), or the same turn is asked again with a retry note after an invalid
 * reply; a typed failure is returned as the error output with its data, and the state is released.
 */
async function handlePartReply(
	input: StepInputBundle, state: StepStatePayload, answer: AnswerProgress, execution?: ConnectionExecutionContext,
): Promise<{ readonly output: StepOutputError | StepOutputEmitBundle | StepOutputEmitPart | StepOutputEmitCombine } | { readonly layers: BundleLayers; readonly handling: HandlingReport }> {
	const executed = state.executed;
	if (executed === undefined) return { output: errorResult('state-decode', 'the stored state has no executed lookups.', false) };
	const ctx = { executed };
	const results = executed.results;
	const intent = { ...state.intent, scope: measureLookupResults(results, state.sizeHint).size };
	const args = { intent, executed, target: state.synthesizerKey };
	// Nothing was covered: the typed failure, with what the lookups found and each part's cause.
	const failed = async (err: ShaperAnswerStepFailedError) => {
		await releaseState(input.state, execution);
		const data: StepErrorData = { results, report: err.found.report, ...(err.partFailures !== undefined ? { partFailures: err.partFailures } : {}) };
		return { output: errorResult(ANSWER_STEP_FAILED, err.message, false, data) };
	};
	const next = async (progress: AnswerProgress, retry?: { attempt: number; reason: string }) => {
		// The turn is measured as rendered: a part that does not fit is not covered and the answer goes on.
		let admitted: ReturnType<typeof admitTurn>;
		try { admitted = admitTurn(progress, args); } catch (err) {
			if (!(err instanceof ShaperAnswerStepFailedError)) throw err;
			return failed(err);
		}
		if (admitted.kind === 'final') return { layers: admitted.layers, handling: admitted.handling };
		const token = await reencodeState(input.state, { ...state, answer: admitted.progress }, execution);
		return { output: turnOutput(admitted.turn, admitted.turn, token, retry) };
	};
	let outcome: FinalizedAnswerTurn | { readonly kind: 'retry'; readonly progress: AnswerProgress };
	try {
		try {
			outcome = finalizeSynthesize(input.bundle, execution, answer, ctx);
		} catch (err) {
			if (!(err instanceof SynthesizerSchemaUnrecoverable)) throw err;
			// A temporary request is told no more than that the reply is invalid.
			const said = execution?.mode === 'session-memory' ? 'Temporary analysis bundle is invalid.' : err.message;
			outcome = recordInvalid(answer, said, loadAnalyzeConfig().shaper.structuredOutputRetries, ctx);
			if (outcome.kind === 'retry') return next(outcome.progress, { attempt: outcome.progress.retries, reason: said });
		}
	} catch (err) {
		if (!(err instanceof ShaperAnswerStepFailedError)) throw err;
		return failed(err);
	}
	if (outcome.kind === 'next') return next(outcome.progress);
	if (outcome.kind === 'final') return { layers: outcome.layers, handling: outcome.handling };
	return { output: errorResult('internal', 'unexpected outcome of a reply to a part', false) };
}

function deriveShaperId(target: string): ShaperId {
	if (target === 'code' || target === 'docs'
	 || target === 'data' || target === 'infra'
	 || target === 'generic') {
		return target;
	}
	return 'generic';
}

function deriveEmptyLayers(layers: Omit<AnalyzeContextBundle, 'meta'>): BundleLayerName[] {
	const out: BundleLayerName[] = [];
	const keys: BundleLayerName[] = [
		'system', 'focus', 'summary', 'structure',
		'surface', 'artefacts', 'upstream',
	];
	for (const k of keys) {
		if (layers[k] === undefined || layers[k].length === 0) out.push(k);
	}
	return out;
}

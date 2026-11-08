import { ConnectionExecutionError, connectionExecutionErrorCode } from '../../../shared/step-context.js';
import { assertAnalysisAudience } from '../analysis-admission.js';
import type { ConnectionExecutionContext } from '../../../shared/step-context.js';
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Preparing the answer-writing turn, for the plan and the narrow phase.
 *
 * Both phases prepare that turn after their lookups ran, and the preparation
 * loads the answer prompt file. When the file is missing the phase would
 * leave with no state returned, and what the lookups found would be lost.
 * Here the missing prompt becomes a non-retryable error that carries the
 * executed results and the report derived from them, and whose message starts
 * with the report's head: its completeness line and, when the report has a
 * measure, its measure line.
 */

import { renderReportHead } from '../../../analyze/completeness.js';
import { admitTurn, startAnswerProgress } from '../../../analyze/context/answer-progress.js';
import type { AnswerProgress, AnswerTurnPrompt } from '../../../analyze/context/answer-progress.js';
import { ShaperAnswerStepFailedError } from '../../../analyze/context/driver.js';
import { inputLimitFor, measureInput } from '../../../analyze/context/handling.js';
import { prepareSynthesize, SynthesizerPromptMissingError } from '../../../analyze/context/synthesizer.js';
import type { ReportScopeInput } from '../../../analyze/explore/answer-report.js';
import { reportFromLookups } from '../../../analyze/explore/answer-report.js';
import type { ExecutedPlan } from '../../../analyze/explore/types.js';
import type { RequestMeasure } from '../../../analyze/measure.js';
import type { StepErrorData, StepOutputEmitBundle, StepOutputEmitCombine, StepOutputEmitPart, StepRetry } from './types.js';

/** The step tool's code for an answer prompt that is missing after the lookups ran. */
export const ANSWER_PROMPT_MISSING = 'answer-prompt-missing';
/** The code of an answer step that could not be written, in one reply or in parts. */
export const ANSWER_STEP_FAILED = 'answer-step-failed';

export type AnswerTurn =
	| {
		readonly ok: true;
		/** The turn the client is asked for first: the one reply of today, or the first part. */
		readonly prepared: ReturnType<typeof prepareSynthesize> & { readonly kind?: 'bundle' | 'part' | 'combine' | undefined };
		/** The answer step's progress, kept in the step state. */
		readonly progress: AnswerProgress;
		/** The part or combine this turn is, when the answer is written in parts. */
		readonly turn: AnswerTurnPrompt | undefined;
	}
	/** The phase returns these through its own error helper, as a non-retryable error. */
	| { readonly ok: false; readonly code: string; readonly message: string; readonly data: StepErrorData };

export function prepareAnswerTurn(args: Parameters<typeof prepareSynthesize>[0] & {
	readonly executed: ExecutedPlan;
	/** The measure of the request, taken from what the lookups returned; it goes into the report of a failed turn. */
	readonly measure?: RequestMeasure | undefined;
	/** The scope the request ran on, for the report of a failed turn. */
	readonly reportScope?: ReportScopeInput | undefined;
}, execution?: ConnectionExecutionContext): AnswerTurn {
	assertAnalysisAudience(execution);
	const { measure, reportScope, ...prepare } = args;
	try {
		const answerArgs = { intent: prepare.intent, executed: args.executed, target: prepare.target };
		let started = startAnswerProgress(answerArgs, prepare.intent.scope);
		if (started.mode === 'single') {
			// The single prompt is measured as it is rendered (purposes, envelopes, escaped JSON); one that does not
			// fit the call is answered in parts, and the plan is made again for them.
			const prepared = prepareSynthesize(prepare);
			const limit = inputLimitFor({ kind: 'unknown' }, 'single');
			if (measureInput(`${prepared.systemPrompt}\n${prepared.userTurn}`, limit.unit) <= limit.limit) return { ok: true, prepared, progress: started, turn: undefined };
			started = startAnswerProgress(answerArgs, prepare.intent.scope, true);
		}
		// The first turn is measured as rendered; a part that does not fit is skipped and the next is the first.
		const admitted = admitTurn(started, answerArgs);
		if (admitted.kind !== 'turn') throw new Error('the first turn of an answer cannot be its end');
		const { turn, progress } = admitted;
		return { ok: true, prepared: { systemPrompt: turn.systemPrompt, userTurn: turn.userTurn, schema: turn.schema, kind: turn.kind }, progress, turn };
	} catch (err) {
		// The input cannot be answered in any number of parts: the answer-step failure, with what the lookups found.
		if (err instanceof ShaperAnswerStepFailedError) {
			const data: StepErrorData = {
				results: args.executed.results,
				report: err.found.report,
				...(err.partFailures !== undefined ? { partFailures: err.partFailures } : {}),
			};
			return { ok: false, code: ANSWER_STEP_FAILED, message: `${renderReportHead(data.report)}\n${err.message}`, data };
		}
		if (execution?.mode === 'session-memory') throw new ConnectionExecutionError(connectionExecutionErrorCode(err) ?? 'unsupported-temporary');
		if (!(err instanceof SynthesizerPromptMissingError)) throw err;
		const data: StepErrorData = { results: args.executed.results, report: reportFromLookups(args.executed.results, measure, reportScope) };
		return {
			ok:   false,
			code: ANSWER_PROMPT_MISSING,
			message:
				`${renderReportHead(data.report)}\n` +
				`The answer could not be written: ${err.message}. This is a fault of the installation, ` +
				`not of the request; calling again will not help. What the ${data.results.length} lookup(s) ` +
				`returned is in this error's data.`,
			data,
		};
	}
}

/**
 * The output that asks the client for a turn: emit_bundle for a single reply, emit_part or emit_combine in parts. The
 * state token is the one just stored; `retry` is set when the same turn is asked again after an invalid reply.
 */
export function turnOutput(
	prepared: { readonly systemPrompt: string; readonly userTurn: string; readonly schema: unknown },
	turn: AnswerTurnPrompt | undefined,
	state: string,
	retry?: StepRetry | undefined,
): StepOutputEmitBundle | StepOutputEmitPart | StepOutputEmitCombine {
	const common = {
		prompt: prepared.systemPrompt, userTurn: prepared.userTurn, schema: prepared.schema as Record<string, unknown>, state,
		...(retry !== undefined ? { retry } : {}),
	};
	const call = 'then call insrc_analyze_step again with phase="bundle", bundle=<your JSON>, state=<the state field verbatim>.';
	const again = retry !== undefined ? `Your previous reply was invalid (${retry.reason}); this is the same turn again. ` : '';
	if (turn?.kind === 'part') {
		return {
			next: 'emit_part', ...common, partId: turn.id ?? '', ordinal: turn.ordinal ?? 1, total: turn.total ?? 1,
			guidance: `${again}The answer is written in parts. Compose the AnalyzeContextBundle JSON of THIS PART only (part ${turn.ordinal} of ${turn.total}), matching the schema below, ${call}`,
		};
	}
	if (turn?.kind === 'combine') {
		return {
			next: 'emit_combine', ...common, stage: turn.stage ?? 1, group: turn.group ?? 1,
			guidance: `${again}The parts are written. Compose the narrative of the whole answer: system, focus and summary (summary within 2,000 characters); the four evidence layers are assembled from the parts, send them as empty strings. Match the schema below, ${call}`,
		};
	}
	return {
		next: 'emit_bundle', ...common,
		guidance: `${again}Compose the AnalyzeContextBundle JSON matching the schema below, ${call}`,
	};
}

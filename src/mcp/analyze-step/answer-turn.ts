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

import { renderReportHead } from '../../analyze/completeness.js';
import { prepareSynthesize, SynthesizerPromptMissingError } from '../../analyze/context/synthesizer.js';
import { reportFromLookups } from '../../analyze/explore/answer-report.js';
import type { ExecutedPlan } from '../../analyze/explore/types.js';
import type { RequestMeasure } from '../../analyze/measure.js';
import type { StepErrorData } from './types.js';

/** The step tool's code for an answer prompt that is missing after the lookups ran. */
export const ANSWER_PROMPT_MISSING = 'answer-prompt-missing';

export type AnswerTurn =
	| { readonly ok: true;  readonly prepared: ReturnType<typeof prepareSynthesize> }
	/** The phase returns these through its own error helper, as a non-retryable error. */
	| { readonly ok: false; readonly code: string; readonly message: string; readonly data: StepErrorData };

export function prepareAnswerTurn(args: Parameters<typeof prepareSynthesize>[0] & {
	readonly executed: ExecutedPlan;
	/** The measure of the request, taken from what the lookups returned; it goes into the report of a failed turn. */
	readonly measure?: RequestMeasure | undefined;
}): AnswerTurn {
	const { measure, ...prepare } = args;
	try {
		return { ok: true, prepared: prepareSynthesize(prepare) };
	} catch (err) {
		if (!(err instanceof SynthesizerPromptMissingError)) throw err;
		const data: StepErrorData = { results: args.executed.results, report: reportFromLookups(args.executed.results, measure) };
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

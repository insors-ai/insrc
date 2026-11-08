/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The errors of an answer step that could not be written. A leaf module: it imports types only, so the modules that
 * divide an answer and the driver that runs the pipeline can both throw them without importing each other.
 */

import type { AnswerStepFound } from './driver.js';
import type { AggregateInputRecord, PartFailure } from './failure-data.js';

/** Why the answer-writing step failed, after the lookups ran. */
export type AnswerStepFailureReason = 'model-failed' | 'invalid-answer' | 'invalid-bundle' | 'input-does-not-fit';

const ANSWER_STEP_FAILURE_TEXT: Readonly<Record<AnswerStepFailureReason, string>> = {
	'model-failed':   'the model call for answer writing failed',
	'invalid-answer': 'the answer-writing output was invalid',
	'invalid-bundle': 'the bundle failed validation',
	'input-does-not-fit': 'the input does not fit the model call',
};

/**
 * The lookups ran and the answer could not be written. The request ends
 * here: no other way of answering is tried. The error carries what the
 * lookups returned and the report derived from them, with the report's
 * `answerFailure` set, so the findings are not lost with the failure.
 */
export class ShaperAnswerStepFailedError extends Error {
	readonly reason: AnswerStepFailureReason;
	readonly found:  AnswerStepFound;
	/** The upstream outputs an aggregate call was given: its inputs, since `found.results` holds lookup results only. */
	readonly upstream?:     readonly AggregateInputRecord[] | undefined;
	/** One entry per part of a divided call that was not covered, with its bounded cause chain. */
	readonly partFailures?: readonly PartFailure[] | undefined;

	constructor(
		reason: AnswerStepFailureReason,
		detail: string,
		found: AnswerStepFound,
		extra?: { readonly upstream?: readonly AggregateInputRecord[] | undefined; readonly partFailures?: readonly PartFailure[] | undefined },
	) {
		const failure = `${ANSWER_STEP_FAILURE_TEXT[reason]}: ${detail}`;
		super(`The answer could not be written after ${found.results.length} lookup(s) ran -- ${failure}`);
		this.name = 'ShaperAnswerStepFailedError';
		this.reason = reason;
		this.found = { results: found.results, report: { ...found.report, answerFailure: failure } };
		this.upstream = extra?.upstream;
		this.partFailures = extra?.partFailures;
	}
}

/**
 * No part of a divided call could be read: every uncovered part was
 * unadmittable, or the fixed context leaves no room for a section. The
 * configuration is what has to change, not the request.
 */
export class HandlingBudgetError extends ShaperAnswerStepFailedError {
	constructor(
		detail: string,
		found: AnswerStepFound,
		extra?: { readonly upstream?: readonly AggregateInputRecord[] | undefined; readonly partFailures?: readonly PartFailure[] | undefined },
	) {
		super('input-does-not-fit', detail, found, extra);
		this.name = 'HandlingBudgetError';
	}
}

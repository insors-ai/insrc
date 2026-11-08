/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How a lookup says "I could not run" (LLD-b9d5c5c40df5a574-s1).
 *
 * A lookup signals that by THROWING; the executor turns the throw into the
 * `failed` output. No lookup returns an empty result for it: an empty result
 * means the lookup ran and found nothing.
 *
 * A lookup that had gathered something before it failed throws
 * `LookupFailedError` carrying it, and the executor copies it to the failed
 * output's `partial`, so what was found is not lost with the failure.
 */

import type { HandlingReport, PartialFinding } from '../completeness.js';
import type { AnswerStepFailureReason } from '../context/driver.js';

/** The prefix of a failed lookup's error code when its final answer could not be written; the reason follows. */
export const ANSWER_STEP_CODE_PREFIX = 'answer-step:';

export class LookupFailedError extends Error {
	readonly partial: readonly PartialFinding[];
	/** How the answer step that failed was handled, for a failure of the answer-writing step (Story s3). */
	readonly handling?: HandlingReport | undefined;
	/** The answer-step reason the failure carried, when the failure is that of the answer-writing step. */
	readonly answerStepReason?: AnswerStepFailureReason | undefined;

	constructor(
		message: string,
		partial: readonly PartialFinding[] = [],
		options?: {
			readonly cause?:            unknown;
			readonly handling?:         HandlingReport | undefined;
			readonly answerStepReason?: AnswerStepFailureReason | undefined;
		},
	) {
		super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
		this.name = 'LookupFailedError';
		this.partial = partial;
		this.handling = options?.handling;
		this.answerStepReason = options?.answerStepReason;
	}
}

/** The message of whatever was thrown. */
export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

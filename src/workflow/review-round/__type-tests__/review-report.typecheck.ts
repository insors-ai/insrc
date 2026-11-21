/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Compile-time checks of ReviewReportDocgenCall's exact field shape and
 * renderReviewReport's exact parameter shape. Nothing here runs.
 *
 * Each @ts-expect-error line must really be an error: tsc reports an unused directive, so a
 * change that widens a field's type, drops `readonly`, or makes an optional field required
 * fails the check.
 */

import type { ReviewReportDocgenCall } from '../review-report.js';
import { renderReviewReport } from '../review-report.js';
import type { Finding } from '../finding.js';
import type { ReconciliationResult } from '../reconciliation.js';

/** True iff A and B are the exact same type (distributes correctly over unions,
 *  unlike `A extends B ? B extends A ? true : false : false`). */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

// Exact-keys proof: fails to compile for ANY added or removed key, named anything.
const _callKeysExact: Equal<keyof ReviewReportDocgenCall, 'reviewId' | 'round'> = true;
void _callKeysExact;

// Parameter-shape proof: fails to compile if renderReviewReport gains, loses, widens, or
// makes optional/rest any parameter -- in particular, proves the corrected four-parameter
// signature (call, findings, reconciliation, priorFindings) the open-question resolution
// requires, not the contract section's original three-parameter draft.
type RenderReviewReportParams = Parameters<typeof renderReviewReport>;
const _renderReviewReportParamsExact: Equal<
	RenderReviewReportParams,
	[ReviewReportDocgenCall, readonly Finding[], readonly ReconciliationResult[] | undefined, readonly Finding[] | undefined]
> = true;
void _renderReviewReportParamsExact;

export function positive(): void {
	const a: ReviewReportDocgenCall = { reviewId: 'review-1', round: 1 };
	void a;
}

export function negative(call: ReviewReportDocgenCall): void {
	// @ts-expect-error ReviewReportDocgenCall.reviewId is required
	const _c1: ReviewReportDocgenCall = { round: 1 };
	// @ts-expect-error ReviewReportDocgenCall.round is required
	const _c2: ReviewReportDocgenCall = { reviewId: 'review-1' };
	// @ts-expect-error ReviewReportDocgenCall has no field named "verdict"
	const _c3: ReviewReportDocgenCall = { reviewId: 'review-1', round: 1, verdict: 'confirmed' };
	// @ts-expect-error ReviewReportDocgenCall.reviewId is readonly
	call.reviewId = 'review-2';
	// @ts-expect-error ReviewReportDocgenCall.round is readonly
	call.round = 2;
}

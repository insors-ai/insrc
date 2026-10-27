/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `insrc_review_step` phase='claims' handler.
 *
 * The controller has extracted the artifact's load-bearing premises. The
 * server now does the DETERMINISTIC middle pass — `gatherEvidence` re-runs
 * each claim's probes (greps + `path:line` reads) against the real source
 * tree (NO LLM here). It then hands the ground-truth evidence back to the
 * controller with a single BATCHED judge prompt: one array of verdicts,
 * one entry per claim, keyed by claimId.
 */

import { resumeControllerDesignReview } from '../controller.js';
import type { ReviewStepDeps, ReviewStepOutput, ReviewStepInputClaims } from '../types.js';

export async function handleClaims(input: ReviewStepInputClaims, deps: ReviewStepDeps = {}): Promise<ReviewStepOutput> {
	return resumeControllerDesignReview(input, deps);
}

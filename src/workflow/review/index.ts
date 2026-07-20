/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Workflow review-cycle engine — public API.
 *
 * A grounded, provider-agnostic pass that verifies an artifact's
 * load-bearing premises against real source and returns a severity-rated,
 * fixability-classified report:
 *
 *   runReview(artifactMarkdown, opts)
 *     = extractClaims  → gatherEvidence (deterministic) → verifyClaim (serial)
 *
 * `renderReviewReport` turns the result into markdown (doc / issue comment).
 */

export * from './types.js';
export { extractClaims } from './extract.js';
export { gatherEvidence } from './probe.js';
export { verifyClaim } from './verify.js';
export { runReview } from './review.js';
export type { ReviewPhase, RunReviewOpts } from './review.js';
export { renderReviewReport } from './report.js';
export { applyAutoFixes, pendingUserFindings } from './apply.js';
export type { AutoFixResult, AppliedFix, SkippedFix } from './apply.js';
export { reviewArtifactFile } from './run-artifact.js';
export type { ReviewArtifactOpts, ReviewArtifactResult } from './run-artifact.js';

import { TaskReviewInputError } from './contracts.js';
import { diagnosticText } from '../../../shared/review-diagnostics.js';
import type { AdmittedReview } from './execution.js';

/** Three total submissions per attempt, shared by native and controller routes. */
export const MAX_ATTRIBUTION_SUBMISSIONS = 3;
export async function recordAttributionRejection(review: AdmittedReview, error: unknown, save: () => Promise<void>): Promise<boolean> {
 if (!(error instanceof TaskReviewInputError)) throw error;
 const prior = review.attempt.header.attributionRepair;
 const rejections = Math.min(MAX_ATTRIBUTION_SUBMISSIONS, (prior?.rejections ?? 0) + 1);
 review.attempt.header.attributionRepair = { rejections, feedback: diagnosticText(error.message, 8192) };
 try { await save(); } catch (failure) {
  if (prior) review.attempt.header.attributionRepair = prior; else delete review.attempt.header.attributionRepair;
  throw failure;
 }
 return rejections < MAX_ATTRIBUTION_SUBMISSIONS;
}

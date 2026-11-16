import { reviewUnavailable } from '../workflow/review-unavailable.js';

// Retained boundaries never open historical review files.
export async function startTaskReview(..._args: readonly unknown[]): Promise<never> { return reviewUnavailable('code'); }
export async function cancelTaskReview(..._args: readonly unknown[]): Promise<never> { return reviewUnavailable('code'); }
export async function readTaskReviewProgress(..._args: readonly unknown[]): Promise<never> { return reviewUnavailable('code'); }
export async function publishStoredTaskReview(..._args: readonly unknown[]): Promise<never> { return reviewUnavailable('code'); }
export async function exchangeControllerTaskReview(..._args: readonly unknown[]): Promise<never> { return reviewUnavailable('code'); }
export async function cleanupApprovedTaskReviews(..._args: readonly unknown[]): Promise<never> { return reviewUnavailable('code'); }
export async function requireApprovedBuildForReviewCleanup(..._args: readonly unknown[]): Promise<never> { return reviewUnavailable('code'); }
export async function cleanupTaskReviewsInOwner(..._args: readonly unknown[]): Promise<never> { return reviewUnavailable('code'); }

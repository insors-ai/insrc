import { reviewUnavailable } from '../review-unavailable.js';
import type { ReviewReport } from './types.js';
export async function runReview(...args: readonly unknown[]): Promise<ReviewReport> { return reviewUnavailable(...args); }

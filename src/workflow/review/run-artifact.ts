import { reviewUnavailable } from '../review-unavailable.js';
import type { ReviewReport, Finding } from './types.js';
export interface ReviewArtifactResult {
	readonly report:      ReviewReport;
	readonly applied:     readonly never[];
	readonly skipped:     readonly never[];
	readonly pendingUser: readonly Finding[];
}
export interface ReviewArtifactOpts { readonly [key: string]: unknown; }
export async function reviewArtifactFile(...args: readonly unknown[]): Promise<ReviewArtifactResult> { return reviewUnavailable(...args); }

import { reviewUnavailable } from '../workflow/review-unavailable.js';
export interface WorkflowReviewDone {
	readonly artifactPath: string;
	readonly verdict:      string;
	readonly counts:       { readonly high: number; readonly med: number; readonly low: number; readonly unverified?: number | undefined };
	readonly reviewedBy:   'daemon';
	readonly model:        string;
	readonly template?:    string | undefined;
	/** Number of auto-fixable findings whose edits were applied. */
	readonly applied:      number;
	/** Number of findings left for the user. */
	readonly pending:      number;
	/** The rendered review report (markdown). */
	readonly report:       string;
}
export async function workflowReviewStart(...args: readonly unknown[]): Promise<never> { return reviewUnavailable(...args); }

/** Additive, review-only atomic state protocol. Owners come from trusted request lifecycle. */
export type ReviewStateKind = 'review' | 'code-review';
export interface ReviewStateExpected { readonly generation: number; readonly callId: string; }
export interface ReviewStateAccess extends ReviewStateExpected {
	readonly kind: ReviewStateKind;
	readonly token: string;
	readonly owner: string;
}
export interface ReviewStateClaim extends ReviewStateAccess { readonly claimId: string; }
export interface ReviewCompletionReceipt {
	readonly status: 'completed';
	readonly callId: string;
	readonly artifactId?: string | undefined;
	readonly runId?: string | undefined;
}
export type ReviewClaimResult<P> =
	| { readonly status: 'claimed'; readonly claim: ReviewStateClaim; readonly payload: P }
	| { readonly status: 'completed'; readonly receipt: ReviewCompletionReceipt };
export type ReviewStateCommit<P> =
	| { readonly status: 'pending'; readonly payload: P; readonly callId: string }
	| { readonly status: 'completed'; readonly receipt: ReviewCompletionReceipt };
export interface ReviewCommitResult { readonly token: string; readonly generation: number; }
export class ReviewStateRefused extends Error {
	constructor(readonly reason: 'review-state-stale' | 'review-state-busy' | 'review-state-owner-mismatch' | 'review-state-uncertain' | 'review-state-capacity' | 'review-state-invalid') {
		super(reason); this.name = 'ReviewStateRefused';
	}
}

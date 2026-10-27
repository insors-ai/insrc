/** Trusted, in-process request authority. Caller JSON never constructs this value. */
export interface ReviewRequestOwnerContext {
	readonly nonce: string;
	readonly assertActive: () => void;
}
const trusted = new WeakSet<object>();
export function createReviewOwnerContext(nonce: string, signal: AbortSignal, assertRequestActive?: (() => void) | undefined): ReviewRequestOwnerContext {
	const owner = Object.freeze({ nonce, assertActive: () => {
		if (signal.aborted) throw new Error('review-state-owner-mismatch');
		assertRequestActive?.();
	} });
	trusted.add(owner);
	return owner;
}
export function requireReviewOwnerContext(owner: ReviewRequestOwnerContext | undefined): ReviewRequestOwnerContext {
	if (!owner || !trusted.has(owner)) throw new Error('review-state-owner-mismatch');
	owner.assertActive(); return owner;
}

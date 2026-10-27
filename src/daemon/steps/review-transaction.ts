import { currentStepContext } from '../../shared/step-context.js';
import { requireReviewOwnerContext } from '../../shared/review-owner-context.js';
import { getStepStateStore } from '../threads/step-state.js';
import { ReviewStateRefused } from '../threads/review-state-contract.js';
import type { ReviewStateKind, ReviewStateClaim, ReviewCompletionReceipt } from '../threads/review-state-contract.js';
import { ReviewBudgetError } from '../../workflow/review-pipeline/budget.js';
import type { ControllerReviewReply } from '../../workflow/review-pipeline/controller.js';

/** One owner/claim lifecycle for design terminals and both controller pipelines. */
export async function claimReviewTransaction<P>(kind: ReviewStateKind, token: string, reply: ControllerReviewReply) {
	const store = getStepStateStore();
	const authority = requireReviewOwnerContext(currentStepContext()?.reviewOwner);
	let held;
	try { held = await store.claimReviewState<P>({ kind, token, generation: reply.generation, callId: reply.callId, owner: authority.nonce }); }
	catch (error) { if (error instanceof ReviewStateRefused && error.reason === 'review-state-stale') throw new ReviewBudgetError('review-budget-state-stale'); throw error; }
	if (held.status === 'completed') return held;
	const claim: ReviewStateClaim = held.claim;
	return { ...held,
		release: () => store.releaseReviewClaim(claim, true),
		complete: (receipt: ReviewCompletionReceipt) => store.commitReviewState(claim, { status: 'completed', receipt }),
		advance: (payload: P, callId: string) => store.commitReviewState(claim, { status: 'pending', payload, callId }),
		invalidate: () => store.invalidateReviewClaim(claim),
		fail: async (error: unknown, effects: boolean, terminal = false): Promise<void> => {
			try { if (effects || terminal) await store.invalidateReviewClaim(claim); else await store.releaseReviewClaim(claim, true); }
			catch { /* Owner loss or an ambiguous committed response is already fenced centrally. */ }
			if (effects || terminal) { if (error instanceof Error) Object.assign(error, { retryable: false }); }
		},
	};
}

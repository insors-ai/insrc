import { claimReviewTransaction } from '../review-transaction.js';
import type { ReviewPipelineJob } from '../../../workflow/review-pipeline/types.js';
import { basename } from 'node:path';
import type { ControllerReviewProtocol } from '../../../workflow/review-pipeline/controller.js';
import { admitControllerFrame, controllerPolicy, requireControllerReply } from '../../../workflow/review-pipeline/controller.js';
import { ReviewBudgetError } from '../../../workflow/review-pipeline/budget.js';
import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import { currentStepContext } from '../../../shared/step-context.js';
import { requireReviewOwnerContext } from '../../../shared/review-owner-context.js';
import type { ReviewStepInputFindings, ReviewStepInputVerdicts, ReviewStepStatePayload, ReviewStepOutput, RawVerdict } from './types.js';

/** Additive terminal protocol; full prompt/extraction continuations build on this in t12. */
export interface ReviewTerminalProtocol extends ControllerReviewProtocol {
	readonly phase: 'claims' | 'findings' | 'verdicts';
	readonly job?: ReviewPipelineJob | undefined;
	readonly templateLimitMs?: number | undefined;
	readonly frameBudget?: import('../../../shared/review-budget.js').ReviewBudgetBreakdown | undefined;
	readonly frameAttemptMs?: number | undefined;
	readonly frameStartedAt?: number | undefined;
	readonly frameDeadlineAt?: number | undefined;
	readonly sourceDigest?: string | undefined;
	readonly schema: Record<string, unknown>;
	readonly deadlineAt: number;
	readonly budgetMs: number;
	readonly expectedClaimIds?: readonly string[] | undefined;
	readonly assignedClaimIds?: readonly string[] | undefined;
	readonly completedVerdicts?: readonly RawVerdict[] | undefined;
	readonly extractionComplete?: boolean | undefined;
	readonly expectedItemIds?: readonly string[] | undefined;
}
export class ReviewTerminalError extends Error {
	constructor(readonly code: 'review-job-timeout' | 'review-terminal-incompatible' | 'review-source-changed' | 'review-attempt-timeout') { super(code); this.name = 'ReviewTerminalError'; }
}
export interface ReviewTerminalGuard {
	assertActive(): void;
 assertSource?(): void;
	/** inspect can repair a staged write, so even that await starts the uncertain-write boundary. */
	beginSideEffects(): void;
	admitCompletion?(frame: ReviewStepOutput): void;
}
export async function withReviewTerminal(
	input: ReviewStepInputFindings | ReviewStepInputVerdicts,
	work: (state: ReviewStepStatePayload, answer: unknown, guard: ReviewTerminalGuard) => Promise<ReviewStepOutput>,
): Promise<ReviewStepOutput> {
	const declaration = controllerPolicy(input.reviewBudget).declaration;
	const reply = requireControllerReply(input.reply);
	const authority = requireReviewOwnerContext(currentStepContext()?.reviewOwner);
	const held = await claimReviewTransaction<ReviewStepStatePayload>('review', input.state, reply);
	if (held.status === 'completed') return { next: 'already_completed', receipt: held.receipt };
	let effects = false;
	try {
		const state = held.payload;
		const protocol = state.controller;
		if (!protocol || protocol.version !== 1 || protocol.generation !== reply.generation || protocol.callId !== reply.callId) throw new ReviewBudgetError('review-budget-state-stale');
		controllerPolicy(declaration, protocol.policy);
		admitControllerFrame({}, protocol.policy, declaration);
		if (protocol.phase !== input.phase || !validateAgainstSchema(protocol.schema, reply.answer).ok) throw new ReviewTerminalError('review-terminal-incompatible');
		const assertActive = (): void => {
			authority.assertActive();
			if (!Number.isSafeInteger(protocol.deadlineAt) || Date.now() >= protocol.deadlineAt) throw new ReviewTerminalError('review-job-timeout');
		};
		assertActive();
		const result = await work(state, reply.answer, { assertActive, beginSideEffects: () => { assertActive(); effects = true; }, admitCompletion: frame => { admitControllerFrame(frame, protocol.policy, declaration); } });
		if (result.next === 'error' && !effects) { await held.release(); return result; }
		if (result.next !== 'done') throw new ReviewTerminalError('review-terminal-incompatible');
		assertActive();
		effects = true;
		await held.complete({ status: 'completed', callId: reply.callId, artifactId: basename(state.jsonPath, '.json'), runId: state.runId });
		return result;
	} catch (error) {
		await held.fail(error, effects, error instanceof ReviewTerminalError && error.code === 'review-job-timeout');
		throw error;
	}
}

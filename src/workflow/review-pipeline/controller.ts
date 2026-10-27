import { reviewCallEvent, safeReviewId } from './call-events.js';
import { createHash } from 'node:crypto';
import type { ReviewBudgetPolicy, ReviewControllerBudgetDeclaration } from '../../shared/review-budget.js';
import { admitReviewBudget, createReviewBudgetPolicy, REVIEW_BUDGET_DEFAULTS, ReviewBudgetError, validateControllerBudgetDeclaration, validateReviewBudgetPolicy } from './budget.js';
import { readReviewChunkTokens } from './limit.js';
import type { ReviewCall } from './types.js';

export interface ControllerReviewReply {
	readonly version: 1;
	readonly generation: number;
	readonly callId: string;
	readonly answer: unknown;
}
export interface ControllerReviewProtocol {
	readonly version: 1;
	readonly generation: number;
	readonly callId: string;
	readonly policy: ReviewBudgetPolicy;
}
export const CONTROLLER_STATE_PLACEHOLDER = 'x'.repeat(22);

/** The server owns the cap and reserve floors. Host history is a refreshed declaration. */
export function controllerPolicy(declaration: ReviewControllerBudgetDeclaration | undefined, pinned?: ReviewBudgetPolicy): { policy: ReviewBudgetPolicy; declaration: ReviewControllerBudgetDeclaration } {
	const d = validateControllerBudgetDeclaration(declaration);
	if (d.profile.transport !== 'controller') throw new ReviewBudgetError('controller-budget-incompatible');
	const profile = { ...d.profile,
		nativeReserveTokens: Math.max(d.profile.nativeReserveTokens, REVIEW_BUDGET_DEFAULTS.nativeReserveTokens),
		transportReserveTokens: Math.max(d.profile.transportReserveTokens, REVIEW_BUDGET_DEFAULTS.transportReserveTokens),
		completionReserveTokens: Math.max(d.profile.completionReserveTokens, REVIEW_BUDGET_DEFAULTS.completionReserveTokens),
		inspectionReserveTokens: Math.max(d.profile.inspectionReserveTokens, REVIEW_BUDGET_DEFAULTS.inspectionReserveTokens),
	};
	if (pinned) validateReviewBudgetPolicy(pinned);
	const policy = pinned ?? createReviewBudgetPolicy(profile, 'controller', readReviewChunkTokens());
	if (JSON.stringify(profile) !== JSON.stringify(policy.profile) || policy.executionKind !== 'controller') throw new ReviewBudgetError('budget-profile-mismatch');
	return { policy, declaration: d };
}

export function controllerPolicyId(policy: ReviewBudgetPolicy): string {
	return createHash('sha256').update(JSON.stringify(policy)).digest('hex');
}
export function requireControllerReply(value: ControllerReviewReply | undefined): ControllerReviewReply {
	if (!value || value.version !== 1 || !Number.isSafeInteger(value.generation) || value.generation < 0 || typeof value.callId !== 'string' || safeReviewId(value.callId) === undefined || !Object.hasOwn(value, 'answer')) throw new ReviewBudgetError('controller-budget-incompatible');
	return value;
}
export function controllerReplySchema(call: Pick<ReviewCall, 'schema' | 'callId'>, generation: number): Record<string, unknown> {
	const schema = call.schema as { properties: { answer: unknown } };
	return { type: 'object', additionalProperties: false, required: ['version', 'generation', 'callId', 'answer'], properties: {
		version: { const: 1 }, generation: { const: generation }, callId: { const: call.callId }, answer: schema.properties.answer,
	} };
}

/** Exact outer MCP serialization used by both review handlers. Schema is inside this frame,
 * so it is not charged again as a separate wire component. Host/native reserves remain estimates. */
export function admitControllerFrame(frame: unknown, policy: ReviewBudgetPolicy, declaration: ReviewControllerBudgetDeclaration) {
	const envelope = { content: [{ type: 'text', text: JSON.stringify(frame, null, 2) }] };
	try { return admitReviewBudget(policy, { promptChars: JSON.stringify(envelope).length, wireSchemaJson: '', schemaEmbedded: true, phase: 'dispatch', hostContextReserveTokens: declaration.hostContextReserveTokens }); }
	catch (error) { if (error instanceof ReviewBudgetError && error.breakdown) throw new ReviewBudgetError('controller-frame-over-budget', error.breakdown); throw error; }
}

export interface ControllerFrameLifetime {
 readonly frameBudget?: import('../../shared/review-budget.js').ReviewBudgetBreakdown | undefined;
 readonly frameAttemptMs?: number | undefined;
 readonly frameStartedAt?: number | undefined;
 readonly frameMonotonicStartedAt?: number | undefined;
 readonly frameDeadlineAt?: number | undefined;
}
/** Both controllers admit and time the exact outer frame through this boundary. */
export function admitControllerTurn(frame: unknown, policy: ReviewBudgetPolicy, declaration: ReviewControllerBudgetDeclaration, attemptMs: number | undefined, now: number): ControllerFrameLifetime {
 return { frameBudget: admitControllerFrame(frame, policy, declaration), frameAttemptMs: attemptMs, frameStartedAt: now, frameMonotonicStartedAt: controllerMonotonicNow(), frameDeadlineAt: attemptMs === undefined ? undefined : now + attemptMs };
}
export function assertControllerAttempt(frame: ControllerFrameLifetime, now: number, checkJob: () => void, attemptError: () => Error): void {
 if (frame.frameDeadlineAt !== undefined && now >= frame.frameDeadlineAt) { checkJob(); throw attemptError(); }
}
export function controllerObservedEvent(job: import('./types.js').ReviewPipelineJob, call: ReviewCall, frame: ControllerFrameLifetime, event: import('./call-events.js').ReviewCallOutcome, now: number, errorCode?: import('./call-events.js').ReviewCallErrorCode | undefined, monotonicNow: number = controllerMonotonicNow()) {
 const effective = frame.frameAttemptMs === undefined ? call : { ...call, execution: call.execution.mode === 'reviewer-session' ? { ...call.execution, deadlineMs: frame.frameAttemptMs } : { ...call.execution, timeoutMs: frame.frameAttemptMs } };
 return reviewCallEvent(job, effective, frame.frameBudget ?? call.budget, event, event === 'start' ? 0 : Math.max(0, monotonicNow - (frame.frameMonotonicStartedAt ?? monotonicNow)), errorCode, now);
}

export const controllerMonotonicNow = (): number => Number(process.hrtime.bigint() / 1_000_000n);

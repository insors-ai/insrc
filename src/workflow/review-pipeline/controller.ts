import { createHash } from 'node:crypto';
import type { ReviewBudgetPolicy, ReviewControllerBudgetDeclaration } from '../../shared/review-budget.js';
import { admitReviewBudget, createReviewBudgetPolicy, REVIEW_BUDGET_DEFAULTS, ReviewBudgetError, validateControllerBudgetDeclaration } from './budget.js';
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
	const policy = pinned ?? createReviewBudgetPolicy(profile, 'controller', readReviewChunkTokens());
	if (JSON.stringify(profile) !== JSON.stringify(policy.profile) || policy.executionKind !== 'controller') throw new ReviewBudgetError('budget-profile-mismatch');
	return { policy, declaration: d };
}

export function controllerPolicyId(policy: ReviewBudgetPolicy): string {
	return createHash('sha256').update(JSON.stringify(policy)).digest('hex');
}
export function requireControllerReply(value: ControllerReviewReply | undefined): ControllerReviewReply {
	if (!value || value.version !== 1 || !Number.isSafeInteger(value.generation) || value.generation < 0 || typeof value.callId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.callId) || !Object.hasOwn(value, 'answer')) throw new ReviewBudgetError('controller-budget-incompatible');
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
	return admitReviewBudget(policy, { promptChars: JSON.stringify(envelope).length, wireSchemaJson: '', schemaEmbedded: true, phase: 'dispatch', hostContextReserveTokens: declaration.hostContextReserveTokens });
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type {
	ReviewBudgetBreakdown, ReviewBudgetErrorCode, ReviewBudgetPolicy, ReviewExecutionKind,
	ReviewProviderBudgetProfile, ReviewControllerBudgetDeclaration,
} from '../../shared/review-budget.js';
import { DEFAULT_REVIEW_CHUNK_TOKENS, REVIEW_CHARS_PER_TOKEN } from './limit.js';

export const REVIEW_BUDGET_DEFAULTS = Object.freeze({
	totalTokens: DEFAULT_REVIEW_CHUNK_TOKENS, nativeReserveTokens: 16384, transportReserveTokens: 1024,
	completionReserveTokens: 8192, inspectionReserveTokens: 24576, retryHeadroomChars: 8000,
});

/** Only allowlisted codes and numeric breakdowns reach persistent failure diagnostics. */
export class ReviewBudgetError extends Error {
	constructor(readonly code: ReviewBudgetErrorCode, readonly breakdown?: ReviewBudgetBreakdown) {
		super(code);
		this.name = 'ReviewBudgetError';
	}
}

function integer(value: unknown, positive = false): asserts value is number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
		throw new ReviewBudgetError('invalid-budget-policy');
	}
}

function identifier(value: unknown): asserts value is string {
	if (typeof value !== 'string' || value.length === 0 || value.length > 128 || !/^[a-zA-Z0-9._:/-]+$/.test(value)) {
		throw new ReviewBudgetError('native-budget-unqualified');
	}
}

/** Reject unsupported serialization without exposing its content or parse error. */
function jsonContainer(text: string): void {
	try {
		const parsed: unknown = JSON.parse(text);
		if (parsed === null || typeof parsed !== 'object') throw new Error();
	} catch { throw new ReviewBudgetError('native-budget-unqualified'); }
}

/** Validate at the boundary, and construct a copy with no caller-owned nested data. */
export function freezeReviewBudgetProfile(profile: ReviewProviderBudgetProfile | undefined): ReviewProviderBudgetProfile {
	if (!profile || profile.profileVersion !== 1
		|| !['json-v1', 'codex-strict-v1', 'controller-json-v1'].includes(profile.schemaDialect)
		|| !['cli-text-v1', 'ollama-chat-v1', 'controller-frame-v1'].includes(profile.promptDialect)
		|| !['managed-estimate', 'reserved-native', 'controller-reserved'].includes(profile.qualification)) {
		throw new ReviewBudgetError('native-budget-unqualified');
	}
	identifier(profile.providerId); identifier(profile.transport); identifier(profile.transportVersion);
	if (typeof profile.declaredToolsJson !== 'string') throw new ReviewBudgetError('native-budget-unqualified');
	// A manifest must be JSON, not a silently omitted/unsupported serialization.
	jsonContainer(profile.declaredToolsJson);
	integer(profile.nativeReserveTokens); integer(profile.transportReserveTokens);
	integer(profile.completionReserveTokens, true); integer(profile.inspectionReserveTokens);
	if (profile.contextWindowTokens !== undefined) integer(profile.contextWindowTokens, true);
	if (profile.qualification === 'reserved-native' && profile.nativeReserveTokens === 0) {
		throw new ReviewBudgetError('native-budget-unqualified');
	}
	if ((profile.schemaDialect === 'controller-json-v1') !== (profile.qualification === 'controller-reserved')
		|| (profile.promptDialect === 'controller-frame-v1') !== (profile.qualification === 'controller-reserved')) {
		throw new ReviewBudgetError('native-budget-unqualified');
	}
	return Object.freeze({
		profileVersion: 1, providerId: profile.providerId, transport: profile.transport,
		transportVersion: profile.transportVersion, promptDialect: profile.promptDialect, schemaDialect: profile.schemaDialect,
		qualification: profile.qualification, declaredToolsJson: profile.declaredToolsJson,
		...(profile.contextWindowTokens !== undefined ? { contextWindowTokens: profile.contextWindowTokens } : {}),
		nativeReserveTokens: profile.nativeReserveTokens, transportReserveTokens: profile.transportReserveTokens,
		completionReserveTokens: profile.completionReserveTokens, inspectionReserveTokens: profile.inspectionReserveTokens,
	});
}

export function createReviewBudgetPolicy(
	profile: ReviewProviderBudgetProfile | undefined,
	executionKind: ReviewExecutionKind,
	totalTokens: number = REVIEW_BUDGET_DEFAULTS.totalTokens,
): ReviewBudgetPolicy {
	integer(totalTokens, true);
	if (!['structured', 'reviewer-session', 'controller'].includes(executionKind)) throw new ReviewBudgetError('invalid-budget-policy');
	const frozen = freezeReviewBudgetProfile(profile);
	if ((executionKind === 'controller') !== (frozen.qualification === 'controller-reserved')) throw new ReviewBudgetError('native-budget-unqualified');
	return Object.freeze({ policyVersion: 1, estimatorVersion: 'chars-per-token-v1', charsPerToken: REVIEW_CHARS_PER_TOKEN,
		totalTokens, executionKind, retryHeadroomChars: REVIEW_BUDGET_DEFAULTS.retryHeadroomChars, profile: frozen });
}

export function validateReviewBudgetPolicy(policy: ReviewBudgetPolicy): void {
	if (!policy || policy.policyVersion !== 1 || policy.estimatorVersion !== 'chars-per-token-v1'
		|| policy.charsPerToken !== REVIEW_CHARS_PER_TOKEN || policy.retryHeadroomChars !== REVIEW_BUDGET_DEFAULTS.retryHeadroomChars) {
		throw new ReviewBudgetError('invalid-budget-policy');
	}
	createReviewBudgetPolicy(policy.profile, policy.executionKind, policy.totalTokens);
}

/** Wire schema/tool strings must already be provider-final (normalization belongs to its profile).
 * Planning reserves prospective correction space. At dispatch the correction is in promptChars;
 * no prospective retry allowance is added again. Each UTF-16 component rounds up independently. */
export function measureReviewBudget(policy: ReviewBudgetPolicy, input: {
	readonly promptChars: number;
	readonly wireSchemaJson: string;
	readonly phase: 'planning' | 'dispatch';
	/** Provider-final manifest for managed turns; absent uses the pinned planning manifest. */
	readonly declaredToolsJson?: string | undefined;
	readonly hostContextReserveTokens?: number | undefined;
}): ReviewBudgetBreakdown {
	validateReviewBudgetPolicy(policy);
	integer(input.promptChars);
	if (typeof input.wireSchemaJson !== 'string' || !['planning', 'dispatch'].includes(input.phase)) throw new ReviewBudgetError('invalid-budget-policy');
	jsonContainer(input.wireSchemaJson);
	const host = input.hostContextReserveTokens ?? 0;
	integer(host);
	if (policy.executionKind === 'controller' && input.hostContextReserveTokens === undefined) throw new ReviewBudgetError('controller-budget-required');
	if (policy.executionKind !== 'controller' && host !== 0) throw new ReviewBudgetError('invalid-budget-policy');
	const profile = policy.profile;
	const declaredToolsJson = input.declaredToolsJson ?? profile.declaredToolsJson;
	if (typeof declaredToolsJson !== 'string') throw new ReviewBudgetError('native-budget-unqualified');
	jsonContainer(declaredToolsJson);
	const tokens = (chars: number): number => Math.ceil(chars / policy.charsPerToken);
	const components = {
		configuredLimitTokens: policy.totalTokens, limitTokens: Math.min(policy.totalTokens, profile.contextWindowTokens ?? policy.totalTokens), promptChars: input.promptChars, promptTokens: tokens(input.promptChars),
		schemaChars: input.wireSchemaJson.length, schemaTokens: tokens(input.wireSchemaJson.length),
		declaredToolsChars: declaredToolsJson.length, declaredToolsTokens: tokens(declaredToolsJson.length),
		nativeReserveTokens: profile.nativeReserveTokens, transportReserveTokens: profile.transportReserveTokens,
		completionReserveTokens: profile.completionReserveTokens, inspectionReserveTokens: profile.inspectionReserveTokens,
		hostContextReserveTokens: host,
		retryHeadroomTokens: input.phase === 'planning' ? tokens(policy.retryHeadroomChars) : 0,
	};
	const estimatedTotalTokens = components.promptTokens + components.schemaTokens + components.declaredToolsTokens
		+ components.nativeReserveTokens + components.transportReserveTokens + components.completionReserveTokens
		+ components.inspectionReserveTokens + host + components.retryHeadroomTokens;
	integer(estimatedTotalTokens);
	return Object.freeze({ ...components, estimatedTotalTokens, remainingTokens: components.limitTokens - estimatedTotalTokens,
		estimatorVersion: policy.estimatorVersion, qualification: profile.qualification });
}

export function admitReviewBudget(policy: ReviewBudgetPolicy, input: Parameters<typeof measureReviewBudget>[1]): ReviewBudgetBreakdown {
	const breakdown = measureReviewBudget(policy, input);
	if (breakdown.remainingTokens < 0) throw new ReviewBudgetError('review-budget-exceeded', breakdown);
	return breakdown;
}

/** Refresh host context on every emission; the declaration never sets the server-owned cap. */
export function validateControllerBudgetDeclaration(declaration: ReviewControllerBudgetDeclaration | undefined): ReviewControllerBudgetDeclaration {
	if (!declaration) throw new ReviewBudgetError('controller-budget-required');
	if (declaration.version !== 1) throw new ReviewBudgetError('controller-budget-incompatible');
	integer(declaration.hostContextReserveTokens);
	const profile = freezeReviewBudgetProfile(declaration.profile);
	if (profile.qualification !== 'controller-reserved') throw new ReviewBudgetError('native-budget-unqualified');
	return Object.freeze({ version: 1, profile, hostContextReserveTokens: declaration.hostContextReserveTokens });
}

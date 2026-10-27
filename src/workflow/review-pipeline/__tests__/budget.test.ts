/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ReviewBudgetPolicy, ReviewProviderBudgetProfile } from '../../../shared/review-budget.js';
import {
	admitReviewBudget, createReviewBudgetPolicy, measureReviewBudget, REVIEW_BUDGET_DEFAULTS,
	ReviewBudgetError, validateControllerBudgetDeclaration,
} from '../budget.js';

const profile = (overrides: Partial<ReviewProviderBudgetProfile> = {}): ReviewProviderBudgetProfile => ({
	profileVersion: 1, providerId: 'fixture', transport: 'cli', transportVersion: '1',
	schemaDialect: 'json-v1', promptDialect: 'cli-text-v1', qualification: 'reserved-native', declaredToolsJson: '[]',
	nativeReserveTokens: 16384, transportReserveTokens: 1024, completionReserveTokens: 8192,
	inspectionReserveTokens: 24576, ...overrides,
});
const input = { promptChars: 4, wireSchemaJson: '{}', phase: 'planning' as const };
const code = (expected: string) => (error: unknown): boolean => error instanceof ReviewBudgetError && error.code === expected && error.message === expected;

test('complete-component boundaries rounding reserves qualification and retry-headroom ownership', () => {
	const policy = createReviewBudgetPolicy(profile(), 'reviewer-session');
	const measured = measureReviewBudget(policy, input);
	assert.equal(measured.limitTokens, 128000);
	assert.equal(measured.promptTokens, 2);
	assert.equal(measured.schemaTokens, 1);
	assert.equal(measured.declaredToolsTokens, 1);
	assert.equal(measured.retryHeadroomTokens, 2667);
	assert.equal(measured.estimatedTotalTokens, 52847);
	assert.equal(measured.remainingTokens, 75153);
	assert.equal(measured.qualification, 'reserved-native');
	assert.equal(measured.estimatorVersion, 'chars-per-token-v1');
	assert.ok(Object.isFrozen(policy) && Object.isFrozen(policy.profile) && Object.isFrozen(measured));
	const exact = createReviewBudgetPolicy(profile(), 'reviewer-session', measured.estimatedTotalTokens);
	assert.equal(admitReviewBudget(exact, input).remainingTokens, 0);
	assert.throws(() => admitReviewBudget(exact, { ...input, promptChars: 7 }), code('review-budget-exceeded'));
	const largeSchema = measureReviewBudget(policy, { ...input, wireSchemaJson: JSON.stringify({ description: 'x'.repeat(3000) }) });
	assert.ok(largeSchema.schemaTokens > 1000);
	assert.equal(largeSchema.estimatedTotalTokens - measured.estimatedTotalTokens, largeSchema.schemaTokens - measured.schemaTokens);
	const tools = measureReviewBudget(createReviewBudgetPolicy(profile({ declaredToolsJson: '{"tools":["read"]}' }), 'reviewer-session'), input);
	assert.ok(tools.declaredToolsTokens > measured.declaredToolsTokens);
	// The actual correction replaces the prospective reserve; it is not counted twice.
	const corrected = measureReviewBudget(policy, { ...input, promptChars: input.promptChars + REVIEW_BUDGET_DEFAULTS.retryHeadroomChars, phase: 'dispatch' });
	assert.equal(corrected.retryHeadroomTokens, 0);
	assert.ok(corrected.estimatedTotalTokens <= measured.estimatedTotalTokens);
	assert.equal(measureReviewBudget(policy, { ...input, phase: 'dispatch' }).estimatedTotalTokens, measured.estimatedTotalTokens - 2667);
	const structured = measureReviewBudget(createReviewBudgetPolicy(profile({ inspectionReserveTokens: 0 }), 'structured'), input);
	assert.equal(measured.estimatedTotalTokens - structured.estimatedTotalTokens, 24576);
	const managed = createReviewBudgetPolicy(profile({ qualification: 'managed-estimate', nativeReserveTokens: 0 }), 'reviewer-session');
	assert.equal(admitReviewBudget(managed, input).qualification, 'managed-estimate');
});

test('invalid and unqualified review policies refuse without retaining raw input', () => {
	const sentinel = 'PRIVATE prompt schema credential';
	assert.throws(() => createReviewBudgetPolicy(undefined, 'structured'), code('native-budget-unqualified'));
	assert.throws(() => createReviewBudgetPolicy(profile({ transport: sentinel }), 'structured'), error => {
		assert.ok(error instanceof ReviewBudgetError);
		assert.ok(!JSON.stringify(error).includes(sentinel));
		return error.message === 'native-budget-unqualified';
	});
	for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
		assert.throws(() => createReviewBudgetPolicy(profile(), 'structured', value), code('invalid-budget-policy'));
		assert.throws(() => createReviewBudgetPolicy(profile({ inspectionReserveTokens: value }), 'structured'), code('native-budget-unqualified'));
		assert.throws(() => measureReviewBudget(createReviewBudgetPolicy(profile(), 'structured'), { ...input, promptChars: value }), code('invalid-budget-policy'));
	}
	assert.throws(() => createReviewBudgetPolicy(profile({ qualification: 'hard-native' as never }), 'structured'), code('native-budget-unqualified'));
	assert.throws(() => createReviewBudgetPolicy(profile({ nativeReserveTokens: 0 }), 'structured'), code('native-budget-unqualified'));
	assert.throws(() => createReviewBudgetPolicy(profile({ declaredToolsJson: sentinel }), 'structured'), code('native-budget-unqualified'));
	assert.throws(() => createReviewBudgetPolicy(profile({ completionReserveTokens: 0 }), 'structured'), code('native-budget-unqualified'));
	for (const invalid of ['null', '0', 'false', '"text"']) {
		assert.throws(() => createReviewBudgetPolicy(profile({ declaredToolsJson: invalid }), 'structured'), code('native-budget-unqualified'));
		assert.throws(() => measureReviewBudget(createReviewBudgetPolicy(profile(), 'structured'), { ...input, wireSchemaJson: invalid }), code('native-budget-unqualified'));
	}
	const policy = createReviewBudgetPolicy(profile(), 'structured');
	assert.throws(() => measureReviewBudget({ ...policy, policyVersion: 0 } as unknown as ReviewBudgetPolicy, input), code('invalid-budget-policy'));
	assert.throws(() => measureReviewBudget(policy, { ...input, wireSchemaJson: sentinel }), code('native-budget-unqualified'));
	assert.throws(() => measureReviewBudget(policy, { ...input, hostContextReserveTokens: 1 }), code('invalid-budget-policy'));
	const original = profile();
	const frozen = createReviewBudgetPolicy(original, 'structured');
	Object.assign(original, { completionReserveTokens: 1 });
	assert.equal(frozen.profile.completionReserveTokens, 8192, 'job owns a copy');
	assert.throws(() => measureReviewBudget(createReviewBudgetPolicy(profile({ nativeReserveTokens: Number.MAX_SAFE_INTEGER }), 'structured'), input), code('invalid-budget-policy'));
});

test('controller host estimates are explicit additive reservations and cannot increase the cap', () => {
	const controllerProfile = profile({ schemaDialect: 'controller-json-v1', promptDialect: 'controller-frame-v1', qualification: 'controller-reserved' });
	assert.throws(() => validateControllerBudgetDeclaration(undefined), code('controller-budget-required'));
	assert.throws(() => validateControllerBudgetDeclaration({ version: 0 as never, profile: controllerProfile, hostContextReserveTokens: 0 }), code('controller-budget-incompatible'));
	assert.throws(() => validateControllerBudgetDeclaration({ version: 1, profile: controllerProfile, hostContextReserveTokens: -1 }), code('controller-budget-incompatible'));
	assert.throws(() => createReviewBudgetPolicy(profile(), 'controller'), code('native-budget-unqualified'));
	assert.throws(() => createReviewBudgetPolicy(controllerProfile, 'structured'), code('native-budget-unqualified'));
	const declaration = validateControllerBudgetDeclaration({ version: 1, profile: controllerProfile, hostContextReserveTokens: 1000 });
	assert.ok(Object.isFrozen(declaration));
	const policy = createReviewBudgetPolicy(declaration.profile, 'controller');
	assert.throws(() => measureReviewBudget(policy, input), code('controller-budget-required'));
	const measured = measureReviewBudget(policy, { ...input, hostContextReserveTokens: declaration.hostContextReserveTokens });
	assert.equal(measured.limitTokens, 128000);
	assert.equal(measured.hostContextReserveTokens, 1000);
	assert.equal(measured.qualification, 'controller-reserved');
	assert.throws(() => admitReviewBudget(policy, { ...input, hostContextReserveTokens: 128000 }), code('review-budget-exceeded'));
});

test('known native context only lowers admission while the configured total remains unchanged', () => {
	const policy = createReviewBudgetPolicy(profile({ contextWindowTokens: 64000 }), 'reviewer-session');
	const b = measureReviewBudget(policy, input);
	assert.equal(policy.totalTokens, 128000);
	assert.equal(b.configuredLimitTokens, 128000);
	assert.equal(b.limitTokens, 64000);
	assert.equal(b.remainingTokens, 64000 - b.estimatedTotalTokens);
	assert.throws(() => admitReviewBudget(createReviewBudgetPolicy(profile({ contextWindowTokens: 1000 }), 'structured'), input), code('review-budget-exceeded'));
	for (const value of [0, -1, NaN, Infinity, 1.5]) assert.throws(() => createReviewBudgetPolicy(profile({ contextWindowTokens: value }), 'structured'), code('native-budget-unqualified'));
});

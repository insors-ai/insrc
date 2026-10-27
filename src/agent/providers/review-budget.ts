/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ReviewBudgetBreakdown, ReviewExecutionBudget, ReviewProviderBudgetProfile } from '../../shared/review-budget.js';
import type { StructuredSchema } from '../../shared/types.js';
import { admitReviewBudget, freezeReviewBudgetProfile, ReviewBudgetError } from '../../workflow/review-pipeline/budget.js';
import { codexStrictSchema } from './structured-output.js';

/** The provider and the planner share exactly this final schema serialization. */
export function reviewWireSchemaJson(profile: ReviewProviderBudgetProfile, schema: StructuredSchema): string {
	freezeReviewBudgetProfile(profile);
	try {
		return JSON.stringify(profile.schemaDialect === 'codex-strict-v1' ? codexStrictSchema(schema) : schema);
	} catch { throw new ReviewBudgetError('native-budget-unqualified'); }
}

/** Final serialization preflight, outside provider retry classification. No content is retained. */
export function preflightProviderReviewBudget(
	budget: ReviewExecutionBudget,
	actualProfile: ReviewProviderBudgetProfile,
	promptChars: number,
	wireSchemaJson: string,
	outputTokens?: number,
): ReviewBudgetBreakdown {
	const pinned = freezeReviewBudgetProfile(budget.policy.profile);
	const actual = freezeReviewBudgetProfile(actualProfile);
	if (JSON.stringify(pinned) !== JSON.stringify(actual)
		|| budget.admitted.limitTokens !== budget.policy.totalTokens
		|| budget.admitted.qualification !== actual.qualification
		|| budget.admitted.estimatorVersion !== budget.policy.estimatorVersion
		|| budget.outputAllowanceTokens !== actual.completionReserveTokens
		|| (outputTokens !== undefined && (!Number.isSafeInteger(outputTokens) || outputTokens <= 0 || outputTokens > budget.outputAllowanceTokens))) {
		throw new ReviewBudgetError('budget-profile-mismatch');
	}
	return admitReviewBudget(budget.policy, { promptChars, wireSchemaJson, phase: 'dispatch' });
}

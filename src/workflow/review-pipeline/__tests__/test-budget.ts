/** Explicit synthetic contracts for pre-existing character-packing fixtures. The generous token
 * cap keeps those fixtures testing their independent text bound; inclusive boundaries have their
 * own production-sized tests. This helper is never used by production code. */
import type { ReviewBudgetPolicy, ReviewExecutionKind } from '../../../shared/review-budget.js';
import { createReviewBudgetPolicy } from '../budget.js';
import { createReviewJob, type CreateJobOpts } from '../job.js';
import { modelDimensionAdapter, type ModelDimensionSpec } from '../code-review.js';
import type { CodeReviewSubject, DimensionResult } from '../../code-review/types.js';
import type { ReviewAdapter, ReviewMaterialSnapshot, ReviewPath } from '../types.js';

export function syntheticReviewBudget(kind: Exclude<ReviewExecutionKind, 'controller'> = 'structured', totalTokens = 10_000_000): ReviewBudgetPolicy {
	return createReviewBudgetPolicy({ profileVersion: 1, providerId: 'fixture', transport: 'fixture', transportVersion: '1',
		schemaDialect: 'json-v1', promptDialect: 'cli-text-v1', qualification: 'managed-estimate', declaredToolsJson: '[]',
		nativeReserveTokens: 0, transportReserveTokens: 0, completionReserveTokens: 1, inspectionReserveTokens: 0,
	}, kind, totalTokens);
}

export function createTestReviewJob(adapter: ReviewAdapter<unknown>, path: ReviewPath, snapshot: ReviewMaterialSnapshot, limitChars: number, opts: Partial<CreateJobOpts> = {}) {
	return createReviewJob(adapter, path, snapshot, limitChars, { ...opts, budgetPolicy: opts.budgetPolicy ?? syntheticReviewBudget() });
}

export function testModelDimensionAdapter<O>(spec: ModelDimensionSpec<O>, subject: CodeReviewSubject, snapshot: ReviewMaterialSnapshot, limitChars?: number, path?: ReviewPath, policy: ReviewBudgetPolicy = syntheticReviewBudget()): ReviewAdapter<DimensionResult> {
	return modelDimensionAdapter(spec, subject, snapshot, limitChars, path, policy);
}

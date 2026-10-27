/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ReviewBudgetPolicy } from '../../shared/review-budget.js';
import type { LLMMessage, StructuredSchema } from '../../shared/types.js';
import { reviewPromptChars, reviewWireSchemaJson } from '../../agent/providers/review-budget.js';
import { measureReviewBudget, ReviewBudgetError } from './budget.js';
import { envelopeMessages, envelopeSchema } from './envelope.js';
import type { ChunkPrompt } from './types.js';

export function requestBudget(policy: ReviewBudgetPolicy, messages: readonly LLMMessage[], schema: StructuredSchema, phase: 'planning' | 'dispatch') {
	return measureReviewBudget(policy, { promptChars: reviewPromptChars(policy.profile, messages), wireSchemaJson: reviewWireSchemaJson(policy.profile, schema), phase });
}

/** A packing score in the existing character coordinate system. Both independent constraints
 * must hold: the current text limit (including a provider size refusal) and the inclusive cap.
 * Rescaling by the current text limit preserves that cap when redivision lowers the text bound. */
export function candidateChars(policy: ReviewBudgetPolicy | undefined, prompt: ChunkPrompt, textLimit: number, phase: 'planning' | 'dispatch' = 'planning'): number {
	if (!policy) throw new ReviewBudgetError('native-budget-unqualified');
	const id = '00000000-0000-0000-0000-000000000000';
	const messages = envelopeMessages(id, prompt.messages);
	const breakdown = requestBudget(policy, messages, envelopeSchema(id, prompt.schema), phase);
	return Math.max(breakdown.promptChars, Math.ceil(breakdown.estimatedTotalTokens / policy.totalTokens * textLimit));
}

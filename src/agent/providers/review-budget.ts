/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ReviewBudgetBreakdown, ReviewExecutionBudget, ReviewProviderBudgetProfile } from '../../shared/review-budget.js';
import type { StructuredSchema, ToolDefinition } from '../../shared/types.js';
import { admitReviewBudget, createReviewBudgetPolicy, freezeReviewBudgetProfile, ReviewBudgetError } from '../../workflow/review-pipeline/budget.js';
import { promptChars } from '../../workflow/review-pipeline/envelope.js';
import { toOllamaMessages, toOllamaTools } from './ollama-wire.js';
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
	declaredToolsJson?: string,
): ReviewBudgetBreakdown {
	const pinned = freezeReviewBudgetProfile(budget.policy.profile);
	const actual = freezeReviewBudgetProfile(actualProfile);
	if (JSON.stringify(pinned) !== JSON.stringify(actual)
		|| budget.admitted.limitTokens !== Math.min(budget.policy.totalTokens, actual.contextWindowTokens ?? budget.policy.totalTokens)
		|| budget.admitted.qualification !== actual.qualification
		|| budget.admitted.estimatorVersion !== budget.policy.estimatorVersion
		|| budget.outputAllowanceTokens !== actual.completionReserveTokens
		|| (outputTokens !== undefined && (!Number.isSafeInteger(outputTokens) || outputTokens <= 0 || outputTokens > budget.outputAllowanceTokens))) {
		throw new ReviewBudgetError('budget-profile-mismatch');
	}
	return admitReviewBudget(budget.policy, { promptChars, wireSchemaJson, phase: 'dispatch', ...(declaredToolsJson !== undefined ? { declaredToolsJson } : {}) });
}

/** The same provider must be selected before any production job is constructed. */
export function resolveReviewBudgetPolicy(
	provider: import('../../shared/types.js').LLMProvider,
	executionKind: 'structured' | 'reviewer-session',
	totalTokens: number,
): import('../../shared/review-budget.js').ReviewBudgetPolicy {
	if (!provider.getReviewBudgetProfile) throw new ReviewBudgetError('native-budget-unqualified');
	try { return createReviewBudgetPolicy(provider.getReviewBudgetProfile(executionKind), executionKind, totalTokens); }
	catch (err) { throw err instanceof ReviewBudgetError ? err : new ReviewBudgetError('native-budget-unqualified'); }
}

/** Provider-final conversation representation, shared by planning and dispatch. */
export function reviewPromptChars(profile: ReviewProviderBudgetProfile, messages: readonly import('../../shared/types.js').LLMMessage[]): number {
	freezeReviewBudgetProfile(profile);
	try {
	for (const message of messages) {
		if (typeof message.content === 'string') continue;
		if (!Array.isArray(message.content)) throw new ReviewBudgetError('native-budget-unqualified');
		for (const block of message.content) {
			if (!block || typeof block !== 'object' || (block.type === 'text' && typeof block.text !== 'string')) throw new ReviewBudgetError('native-budget-unqualified');
			const supported = block.type === 'text' || (profile.promptDialect === 'ollama-chat-v1' && ((block.type === 'tool_use' && message.role === 'assistant') || (block.type === 'tool_result' && message.role === 'user')));
			if (!supported) throw new ReviewBudgetError('native-budget-unqualified');
		}
		if (profile.promptDialect === 'ollama-chat-v1' && message.content.some(block => block.type === 'tool_result') && message.content.some(block => block.type !== 'tool_result')) throw new ReviewBudgetError('native-budget-unqualified');
	}
	switch (profile.promptDialect) {
		case 'cli-text-v1': return promptChars(messages);
		case 'ollama-chat-v1': return JSON.stringify(toOllamaMessages(messages)).length;
		case 'controller-frame-v1': throw new ReviewBudgetError('controller-budget-incompatible');
	}
	} catch (error) { throw error instanceof ReviewBudgetError ? error : new ReviewBudgetError('native-budget-unqualified'); }
}

/** Declared native tools, serialized by the same helper used at the managed provider wire. */
export function reviewToolsJson(profile: ReviewProviderBudgetProfile, tools: readonly ToolDefinition[]): string {
	freezeReviewBudgetProfile(profile);
	if (profile.promptDialect === 'controller-frame-v1') throw new ReviewBudgetError('controller-budget-incompatible');
	try { return JSON.stringify(profile.promptDialect === 'ollama-chat-v1' ? toOllamaTools(tools) : tools); }
	catch { throw new ReviewBudgetError('native-budget-unqualified'); }
}

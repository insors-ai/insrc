/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { ReviewBudgetError } from '../budget.js';
import { runDimensionJob } from '../code-review.js';
import { toyAdapter, toySnapshot, atom } from './toy-adapter.js';
import { runReview } from '../../review/review.js';
import { runTemplateReview } from '../../review/template-review.js';
import { reviewTemplateFor } from '../../review/template.js';
import type { CodeReviewSubject } from '../../code-review/types.js';

test('code grounded and template review resolve the selected profile before job construction', async () => {
	const snapshot = toySnapshot([atom(1)]);
	for (const entry of ['code', 'grounded', 'template'] as const) {
		const events: string[] = [];
		const envelope = (schema: StructuredSchema, answer: unknown) => ({ callId: (schema as { properties: { callId: { const: string } } }).properties.callId.const, answer });
		const selected = new CliProvider({ kind: 'codex', model: 'fixture' });
		const provider = {
			getReviewBudgetProfile: (kind: 'structured' | 'reviewer-session') => { events.push(`profile:${kind}`); return selected.getReviewBudgetProfile(kind); },
			completeStructured: async (_messages: unknown, schema: StructuredSchema) => { events.push('model'); return envelope(schema, entry === 'code' ? { seen: ['a1'] } : { claims: [] }); },
			runReviewSession: async (_prompt: unknown, schema: StructuredSchema) => {
				events.push('model');
				return envelope(schema, { items: reviewTemplateFor('spec').items.map(item => ({ item: item.id, premises: [{ premise: 'fixture claim', outcome: 'holds', evidence: 'fixture evidence', action: '' }] })) });
			},
		} as unknown as LLMProvider;
		const run = (p: LLMProvider) => {
			if (entry === 'code') return runDimensionJob((_snap, policy) => {
				events.push('build'); assert.equal(policy.profile.providerId, 'cli-codex:fixture');
				return toyAdapter(snapshot) as never;
			}, { repoPath: '/tmp', epicHash: 'fixture', storyId: 's1' } as CodeReviewSubject, { symbols: [] }, p, { groundingMode: 'full', snapshot });
			const opts = { repo: '/tmp', stage: entry === 'template' ? 'design.story' : 'define', model: 'fixture', provider: p, readEntitiesForRepo: async () => [] };
			return entry === 'template' ? runTemplateReview('# Story\nFixture.', opts) : runReview('# Definition\nFixture.', opts);
		};
		await assert.rejects(() => run({ ...provider, getReviewBudgetProfile: undefined } as unknown as LLMProvider), e => e instanceof ReviewBudgetError && e.code === 'native-budget-unqualified');
		assert.deepEqual(events, [], 'missing profile refuses before model calls or code adapter construction');
		await run(provider);
		assert.equal(events[0], entry === 'template' ? 'profile:reviewer-session' : 'profile:structured');
		assert.ok(events.includes('model'));
		if (entry === 'code') assert.deepEqual(events.slice(0, 4), ['profile:structured', 'build', 'profile:structured', 'model']);
	}
});

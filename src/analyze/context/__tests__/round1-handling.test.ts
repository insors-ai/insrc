/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Review round 1 of Story s3 on the shared handling: a prompt that alone does not fit, with no evidence to divide,
 * is a typed budget failure (not an unbounded call), and the aggregator's combine summary is capped like a part's.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { HandlingBudgetError } from '../answer-step-error.js';
import { runHandled } from '../handling-parts.js';
import type { PartAdapter } from '../handling-parts.js';
import { AGGREGATE_COMBINE_SCHEMA } from '../../runtimes/shared/aggregator.js';

test('a prompt that alone does not fit, with nothing to divide, is a typed budget failure and no call is made', async () => {
	let calls = 0;
	const provider = { inputBudgetChars: 16_100, completeStructured: async () => { calls++; return {}; } } as unknown as LLMProvider;
	const adapter = {
		partSchema: { type: 'object' } as unknown as StructuredSchema, combineSchema: { type: 'object' } as unknown as StructuredSchema,
		renderPart: () => [], renderCombine: () => [], summaryOf: () => '', summaryOfCombine: () => '',
	} as unknown as PartAdapter<unknown, unknown>;
	const messages: LLMMessage[] = [{ role: 'user', content: 'x'.repeat(5_000) }];
	const thrown = await runHandled({
		provider, target: { kind: 'cli', inputBudgetChars: 16_100 }, adapter, blocks: [], reference: [],
		found: { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } },
		maxAttempts: 2, size: 'S', singleMessages: messages, singleSchema: { type: 'object' } as unknown as StructuredSchema,
	}).then(() => undefined, (e: unknown) => e);
	assert.ok(thrown instanceof HandlingBudgetError, String(thrown));
	assert.equal(calls, 0);
});

test('the aggregator combine schema caps a summary like a part summary', () => {
	const schema = AGGREGATE_COMBINE_SCHEMA as unknown as { properties: { summary: { maxLength?: number } } };
	assert.equal(schema.properties.summary.maxLength, 2_000);
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { createReviewBudgetPolicy, ReviewBudgetError } from '../budget.js';
import { createReviewJob } from '../job.js';
import { runReviewJob } from '../driver.js';
import type { ReviewCallEvent } from '../call-events.js';
import { toyAdapter, toySnapshot, atom } from './toy-adapter.js';
import type { FailurePolicy, ReviewAdapter, ReviewPipelineJob } from '../types.js';

function fixture(failurePolicy: FailurePolicy = 'fail-review') {
	const snapshot = toySnapshot([atom(1)]);
	const profile = new CliProvider({ kind: 'codex', model: 'fixture' }).getReviewBudgetProfile('structured');
	const policy = createReviewBudgetPolicy(profile, 'structured');
	const adapter = toyAdapter(snapshot, { onCallFailure: failurePolicy }) as ReviewAdapter<unknown>;
	const job = createReviewJob(adapter, 'daemon', snapshot, 384000, { budgetPolicy: policy });
	return { profile, policy, adapter, job };
}
const echoed = (schema: StructuredSchema) => ({ callId: (schema as { properties: { callId: { const: string } } }).properties.callId.const, answer: { seen: ['a1'] } });

test('dispatch refusals bypass retry and partial-result policies and emit paired safe lifecycle events', async () => {
	for (const failurePolicy of ['fail-review', 'record-not-judged', 'record-observation'] as const) {
		const { profile, adapter, job } = fixture(failurePolicy);
		for (const scenario of ['overflow', 'profile-mismatch', 'missing-profile', 'provider-refusal'] as const) {
			let calls = 0;
			let completions = 0;
			const events: ReviewCallEvent[] = [];
			const provider = {
				getReviewBudgetProfile: scenario === 'missing-profile' ? undefined : () => scenario === 'profile-mismatch' ? { ...profile, transportVersion: 'other' } : profile,
				completeStructured: async () => { calls++; throw new ReviewBudgetError('review-budget-exceeded'); },
			} as unknown as LLMProvider;
			const input: ReviewPipelineJob = scenario === 'overflow' ? { ...job, pending: job.pending.map(call => ({ ...call, messages: [...call.messages, { role: 'user', content: 'PRIVATE_SOURCE_CREDENTIAL'.repeat(20000) }] })) } : job;
			await assert.rejects(() => runReviewJob(input, adapter, provider, { onCallEvent: e => events.push(e), onDone: () => { completions++; } }), e => e instanceof ReviewBudgetError);
			assert.equal(completions, 0, `${failurePolicy}/${scenario} never completes a partial review`);
			assert.equal(calls, scenario === 'provider-refusal' ? 1 : 0, 'budget refusal is never retried');
			assert.deepEqual(events.map(e => e.event), scenario === 'provider-refusal' ? ['start', 'failure'] : ['refused']);
			assert.equal(events.at(-1)!.errorCode, 'budget-refused');
			assert.ok(!JSON.stringify(events).includes('PRIVATE_SOURCE_CREDENTIAL'));
			assert.deepEqual(job.notJudged, [], 'no observation/not-judged result is substituted for a refusal');
		}
	}
});

test('successful failed and cancelled calls have exactly one content-free terminal event', async () => {
	for (const outcome of ['success', 'failure', 'cancel'] as const) {
		const { profile, adapter, job } = fixture();
		const events: ReviewCallEvent[] = [];
		const controller = new AbortController();
		let calls = 0;
		const provider = {
			getReviewBudgetProfile: () => profile,
			completeStructured: async (_messages: unknown, schema: StructuredSchema, opts: { reviewBudget?: unknown; internalRetry?: boolean }) => {
				calls++; assert.ok(opts.reviewBudget); assert.equal(opts.internalRetry, false);
				if (outcome === 'failure') throw new Error('PRIVATE_SOURCE_CREDENTIAL backend details');
				if (outcome === 'cancel') { queueMicrotask(() => controller.abort()); return new Promise(() => {}); }
				return echoed(schema);
			},
		} as unknown as LLMProvider;
		const work = runReviewJob(job, adapter, provider, { signal: controller.signal, onCallEvent: e => events.push(e) });
		if (outcome === 'success') await work;
		else await assert.rejects(() => work, e => {
			assert.ok(e instanceof Error); assert.ok(!e.message.includes('PRIVATE_SOURCE_CREDENTIAL')); return true;
		});
		assert.equal(calls, outcome === 'failure' ? 2 : 1);
		const starts = events.filter(e => e.event === 'start');
		assert.equal(starts.length, calls);
		for (const start of starts) {
			const terminal = events.filter(e => e.callId === start.callId && e.event !== 'start');
			assert.equal(terminal.length, 1);
			assert.equal(terminal[0]!.event, outcome);
			assert.ok(terminal[0]!.durationMs >= 0);
			assert.ok(start.budget.remainingTokens >= 0);
		}
		assert.ok(!JSON.stringify(events).includes('PRIVATE_SOURCE_CREDENTIAL'));
	}
});

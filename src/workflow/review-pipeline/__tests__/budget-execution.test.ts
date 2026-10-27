/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import { ReviewStreamError } from '../../../shared/review-stream.js';
import { withReviewExecutionCeiling } from '../../../shared/review-execution-time.js';
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

test('effective attempt timer remaining-time clamp and transport-ceiling diagnostics are enforced', async () => {
	const { profile, adapter, job } = fixture();
	assert.equal(new ReviewStreamError('timeout', 'wait', 'ceiling').timeoutKind, 'external-review-transport');
	assert.equal(new ReviewStreamError('timeout', 'wait', 'idle').timeoutKind, 'external-review-idle');
	assert.equal(new ReviewStreamError('daemon-error', 'wait', 'freshness-timeout').timeoutKind, 'review-freshness');
	let sends = 0;
	let observed: AbortSignal | undefined;
	const provider = {
		getReviewBudgetProfile: () => profile,
		completeStructured: async (_messages: unknown, _schema: unknown, opts: { signal: AbortSignal }) => {
			sends++; observed = opts.signal;
			return new Promise(() => {}); // deliberately ignores cancellation
		},
	} as unknown as LLMProvider;
	await assert.rejects(runReviewJob(job, adapter, provider, { outerCeilingMs: 1 }), /transport-ceiling-incompatible/);
	await assert.rejects(withReviewExecutionCeiling({ executionCeilingMs: 5 }, () => runReviewJob(job, adapter, provider)), /transport-ceiling-incompatible/);
	assert.equal(sends, 0);
	const limited = { ...job, pending: job.pending.map(c => ({ ...c, execution: { mode: 'structured' as const, timeoutMs: 15 } })) };
	const began = performance.now();
	await assert.rejects(runReviewJob(limited, adapter, provider), /time|limit/i);
	assert.ok(performance.now() - began < 1000);
	assert.equal(sends, 1, 'timed-out attempt is not retried');
	assert.equal(observed?.aborted, true);
	const remaining = { ...limited, deadlineAt: Date.now() + 12 };
	await assert.rejects(runReviewJob(remaining, adapter, provider), /time|limit/i);
	assert.equal(sends, 2);
	let deterministicSignal: AbortSignal | undefined;
	const blocked = { ...adapter, stagesFor: () => [{ id: 'blocked', kind: 'deterministic' as const, after: [], singleCalls: () => [], chunkCalls: () => [], onCallFailure: 'record-observation' as const,
		run: async (_outputs: unknown, _snapshot: unknown, signal?: AbortSignal) => { deterministicSignal = signal; return new Promise(() => {}); } }] };
	const events: ReviewCallEvent[] = [];
	await assert.rejects(runReviewJob({ ...job, stage: 'blocked', pending: [], deadlineAt: Date.now() + 12 }, blocked, provider), e => (e as { timeoutKind: string }).timeoutKind === 'review-job');
	assert.equal(deterministicSignal?.aborted, true, 'deadline cancels deterministic tool waits');
	await assert.rejects(runReviewJob(limited, adapter, provider, { onCallEvent: e => events.push(e) }), e => (e as { timeoutKind: string }).timeoutKind === 'review-attempt');
	assert.equal(events.at(-1)?.errorCode, 'attempt-timeout');
});

import { validateFinding } from '../../code-review/controller-validation.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { OllamaProvider } from '../../../agent/providers/ollama.js';
import { reviewPromptChars } from '../../../agent/providers/review-budget.js';
import type { LLMMessage, LLMProvider } from '../../../shared/types.js';
import { createReviewBudgetPolicy, ReviewBudgetError } from '../budget.js';
import { createReviewJob, applyFailure, nextCalls } from '../job.js';
import { runReviewJob } from '../driver.js';
import { reviewCallEvent } from '../call-events.js';
import { toyAdapter, toySnapshot, atom } from './toy-adapter.js';
import type { FailurePolicy, ReviewAdapter } from '../types.js';
import { controllerPolicy, admitControllerFrame } from '../controller.js';
import { CONTROLLER_DECLARATION } from '../../../daemon/steps/code-review-step/__tests__/controller-client.js';

const policy = createReviewBudgetPolicy(new CliProvider({ kind: 'codex', model: 'fixture' }).getReviewBudgetProfile('structured'), 'structured');
test('deterministic budget errors remain terminal under every failure policy and ordinary failures retain no source text', async () => {
	for (const onCallFailure of ['fail-review', 'record-not-judged', 'record-observation'] as FailurePolicy[]) {
		for (const budgetFailure of [true, false]) {
			const snapshot = toySnapshot([]), base = toyAdapter(snapshot);
			const refusal = new ReviewBudgetError('inspection-budget-exceeded');
			const adapter: ReviewAdapter<unknown> = { ...base, stagesFor: () => [{ id: 'probe', kind: 'deterministic', after: [], onCallFailure,
				run: async () => { throw budgetFailure ? refusal : new Error('PRIVATE_SOURCE_CANARY'); } }] };
			const job = createReviewJob(adapter, 'daemon', snapshot, 384000, { budgetPolicy: policy });
			const work = runReviewJob(job, adapter, {} as LLMProvider);
			if (budgetFailure || onCallFailure === 'fail-review') await assert.rejects(work, error => {
				if (budgetFailure) { assert.ok(error instanceof ReviewBudgetError); assert.equal(error.code, refusal.code); assert.equal(error.context?.stage, 'probe'); }
				assert.ok(!String(error).includes('PRIVATE_SOURCE_CANARY')); return true;
			});
			else assert.ok(!JSON.stringify(await work).includes('PRIVATE_SOURCE_CANARY'));
		}
	}
});

test('deterministic-only work obeys a shorter outer deadline without waiting for the ten-minute stage watchdog', { timeout: 1000 }, async () => {
	const snapshot = toySnapshot([]), base = toyAdapter(snapshot);
	const adapter: ReviewAdapter<unknown> = { ...base, stagesFor: () => [{ id: 'probe', kind: 'deterministic', after: [], onCallFailure: 'record-observation', run: async () => new Promise(() => {}) }] };
	const job = createReviewJob(adapter, 'daemon', snapshot, 384000, { budgetPolicy: policy });
	await assert.rejects(runReviewJob(job, adapter, {} as LLMProvider, { outerCeilingMs: 20 }), error => (error as { timeoutKind?: string | undefined }).timeoutKind === 'external-review-transport');
});

test('size refusal of a corrected retry never rebuilds an uncorrected request', () => {
	const snapshot = toySnapshot([atom(1)]), adapter = toyAdapter(snapshot) as ReviewAdapter<unknown>;
	const job = createReviewJob(adapter, 'daemon', snapshot, 384000, { budgetPolicy: policy, now: 1000 });
	const first = nextCalls(job, adapter, 1000)[0]!;
	const corrected = applyFailure(job, adapter, first.callId, 'invalid-answer', undefined, { reasons: ['required correction'], now: 1001 });
	const retry = nextCalls(corrected, adapter, 1001)[0]!;
	assert.ok(JSON.stringify(retry.messages).includes('required correction'));
	assert.throws(() => applyFailure(corrected, adapter, retry.callId, 'size-refusal', 100, { now: 1002 }), error => {
		assert.ok(error instanceof ReviewBudgetError); assert.equal(error.code, 'correction-budget-exceeded');
		assert.ok(error.breakdown); assert.equal(error.context?.callId, retry.callId); return true;
	});
});

test('unsupported review blocks refuse rather than disappear and lifecycle timing and obligation identity are source safe', () => {
	const image = [{ role: 'user', content: [{ type: 'image', source: { data: 'PRIVATE_SOURCE_CANARY'.repeat(1000) } }] }] as unknown as LLMMessage[];
	for (const profile of [policy.profile, new OllamaProvider('fixture').getReviewBudgetProfile('structured')]) {
		assert.throws(() => reviewPromptChars(profile, image), error => error instanceof ReviewBudgetError && error.code === 'native-budget-unqualified');
	}
	const snapshot = toySnapshot([atom(1)]), adapter = toyAdapter(snapshot) as ReviewAdapter<unknown>;
	const job = createReviewJob(adapter, 'daemon', snapshot, 384000, { budgetPolicy: policy, now: 1000 });
	const call = nextCalls(job, adapter, 1000)[0]!;
	const event = reviewCallEvent(job, { ...call, carries: { ...call.carries, key: 'PRIVATE_SOURCE_CANARY' } }, call.budget, 'failure', 10, 'call-failed', 1050);
	assert.equal(event.timing.timeBudgetUnitMs, 600000); assert.equal(event.timing.elapsedMs, 50);
	assert.equal(event.timing.remainingMs, 599950); assert.match(event.obligationKey!, /^[a-f0-9]{24}$/);
	assert.ok(!JSON.stringify(event).includes('PRIVATE_SOURCE_CANARY'));
	const declared = controllerPolicy(CONTROLLER_DECLARATION);
	assert.throws(() => controllerPolicy({ ...CONTROLLER_DECLARATION, hostContextReserveTokens: 0 }));
	assert.throws(() => admitControllerFrame({ prompt: 'x'.repeat(400000) }, declared.policy, declared.declaration), error => error instanceof ReviewBudgetError && error.code === 'controller-frame-over-budget' && error.breakdown !== undefined);
});


test('controller findings require a real file and safe positive line number', () => {
	const finding = { severity: 'MED', message: 'needs correction' };
	for (const location of [':', ':1', ' :1', 'src/a.ts:wrong', 'src/a.ts:0', 'src/a.ts:-1', 'src/a.ts:999999999999999999999999999']) assert.ok(validateFinding({ ...finding, location }, 'quality'));
	assert.equal(validateFinding({ ...finding, location: 'src/a.ts:1' }, 'quality'), null);
});

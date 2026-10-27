import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CliProvider } from '../../../agent/providers/cli-provider.js';
import { preflightProviderReviewBudget, reviewPromptChars, reviewWireSchemaJson } from '../../../agent/providers/review-budget.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import type { ReviewExecutionBudget } from '../../../shared/review-budget.js';
import { createReviewBudgetPolicy } from '../budget.js';
import { createReviewJob } from '../job.js';
import { runReviewJob } from '../driver.js';
import { atom, toyAdapter, toySnapshot, atomIdsIn, asSent } from './toy-adapter.js';
import type { ReviewAdapter } from '../types.js';
import type { ReviewCallEvent } from '../call-events.js';
import { controllerPolicy, admitControllerFrame } from '../controller.js';
import { CONTROLLER_DECLARATION } from '../../../daemon/steps/code-review-step/__tests__/controller-client.js';

test('assembled code design provider and controller boundaries enforce the same inclusive budget evidence timing and safe telemetry', async () => {
	for (const originalChars of [371253, 225429]) {
		for (const mode of ['structured', 'reviewer-session'] as const) {
			const profile = new CliProvider({ kind: 'codex', model: 'fixture' }).getReviewBudgetProfile(mode);
			const policy = createReviewBudgetPolicy(profile, mode);
			const atoms = Array.from({ length: 12 }, (_, index) => ({ ...atom(index + 1), text: 'PRIVATE_SOURCE_CANARY' + 'x'.repeat(Math.floor(originalChars / 12) - 21 + (index === 0 ? originalChars % 12 : 0)) }));
			assert.equal(atoms.reduce((sum, value) => sum + value.text.length, 0), originalChars);
			const snapshot = toySnapshot(atoms);
			const adapter = toyAdapter(snapshot, { execution: mode === 'structured' ? { mode, cwd: '/tmp', timeoutMs: 600000 } : { mode, cwd: '/tmp', deadlineMs: 600000 } }) as ReviewAdapter<unknown>;
			const job = createReviewJob(adapter, 'daemon', snapshot, 384000, { budgetPolicy: policy });
			const events: ReviewCallEvent[] = []; let active = 0, calls = 0;
			const answer = async (text: string, schema: StructuredSchema, opts: { reviewBudget?: ReviewExecutionBudget }) => {
				assert.equal(active++, 0, 'all dispatches remain serial'); calls++;
				try {
					const fields = schema as { properties: { callId: { const: string } } };
					assert.ok(opts.reviewBudget); assert.equal(opts.reviewBudget.policy.totalTokens, 128000);
					const messages: LLMMessage[] = [{ role: 'user', content: text }];
					const prepared = preflightProviderReviewBudget(opts.reviewBudget, profile, mode === 'reviewer-session' ? text.length : reviewPromptChars(profile, messages), reviewWireSchemaJson(profile, schema));
					assert.ok(prepared.schemaTokens > 0 && prepared.nativeReserveTokens > 0 && prepared.completionReserveTokens > 0);
					assert.ok(prepared.estimatedTotalTokens <= prepared.limitTokens);
					return { callId: fields.properties.callId.const, answer: { seen: atomIdsIn(text) } };
				} finally { active--; }
			};
			const provider = { getReviewBudgetProfile: () => profile,
				completeStructured: async (messages: readonly LLMMessage[], schema: StructuredSchema, opts: { reviewBudget?: ReviewExecutionBudget }) => answer(asSent(messages), schema, opts),
				runReviewSession: async (text: string, schema: StructuredSchema, opts: { reviewBudget?: ReviewExecutionBudget }) => answer(text, schema, opts),
			} as unknown as LLMProvider;
			const result = await runReviewJob(job, adapter, provider, { onCallEvent: event => events.push(event) }) as { seen: string[] };
			assert.deepEqual(new Set(result.seen), new Set(atoms.map(value => value.id)), 'all original source atoms survive');
			assert.ok(calls >= 1);
			if (originalChars === 371253 || mode === 'reviewer-session') assert.ok(calls > 1, 'complete reserves force partitioning when required'); assert.equal(events.filter(event => event.event === 'success').length, calls);
			for (const event of events) { assert.equal(event.timing.jobBudgetMs, event.timing.logicalWorkUnits * 600000); assert.ok(event.budget.estimatedTotalTokens <= 128000); }
			assert.ok(!JSON.stringify(events).includes('PRIVATE_SOURCE_CANARY'));
		}
	}
	const declaration = CONTROLLER_DECLARATION, policy = controllerPolicy(declaration).policy;
	const frame = { prompt: { user: 'complete assigned evidence' }, schema: { type: 'object', description: 'schema '.repeat(1000) }, state: 'x'.repeat(22) };
	const admitted = admitControllerFrame(frame, policy, declaration);
	assert.equal(admitted.schemaTokens, 0, 'embedded schemas are counted inside the full frame once');
	assert.equal(admitted.promptChars, JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(frame, null, 2) }] }).length);
	assert.equal(admitControllerFrame(frame, policy, { ...declaration, hostContextReserveTokens: 2000 }).estimatedTotalTokens - admitted.estimatedTotalTokens, 1000);
});

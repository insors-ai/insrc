import assert from 'node:assert/strict';
import { test } from 'node:test';
import { envelopeMessages, envelopeSchema, promptChars } from '../envelope.js';
import type { LLMMessage, LLMProvider, StructuredSchema } from '../../../shared/types.js';
import { runReviewJob } from '../driver.js';
import { createReviewJob } from '../job.js';
import { AtomTooLargeError } from '../pack-into-batches.js';
import { atom, toyAdapter, toySnapshot } from './toy-adapter.js';

test('DIFF-BUDGET: the actual schema changes planning and every issued call includes it in its budget', () => {
	const snapshot = toySnapshot(Array.from({ length: 20 }, (_, i) => atom(i, 180)));
	const base = toyAdapter(snapshot);
	const adapter = { ...base, stagesFor: () => base.stagesFor('daemon').map(stage => ({
		...stage,
		singleCalls: (...args: Parameters<typeof stage.singleCalls>) => stage.singleCalls(...args).map(p => ({ ...p, schema: { ...p.schema, description: 'schema context '.repeat(100) } })),
		chunkCalls: (...args: Parameters<typeof stage.chunkCalls>) => stage.chunkCalls(...args).map(p => ({ ...p, schema: { ...p.schema, description: 'schema context '.repeat(100) } })),
	})) };
	const probe = createReviewJob(adapter, 'daemon', snapshot, 100_000);
	const first = probe.pending[0]!;
	const textOnly = promptChars(first.messages);
	assert.ok(first.chars > textOnly + 1_400, 'schema is real input beyond prompt text');
	assert.equal(first.chars, promptChars(first.messages, first.schema));
	const bounded = createReviewJob(adapter, 'daemon', snapshot, textOnly + 1);
	assert.equal(bounded.plan.single, false, 'text fits, complete input requires division');
	for (const call of bounded.pending) {
		assert.ok(promptChars(call.messages, call.schema) <= bounded.plan.limitChars);
		assert.deepEqual(call.schema, envelopeSchema(call.callId, call.prompt.schema));
		assert.deepEqual(call.messages, envelopeMessages(call.callId, call.prompt.messages));
	}
});

test('DIFF-BUDGET: irreducible schema and explicit history are never omitted to fit', async () => {
	const snapshot = toySnapshot([atom(1)]);
	const base = toyAdapter(snapshot);
	const adapter = { ...base, stagesFor: () => base.stagesFor('daemon').map(stage => ({
		...stage,
		singleCalls: (...args: Parameters<typeof stage.singleCalls>) => stage.singleCalls(...args).map(p => ({ ...p, schema: { ...p.schema, description: 'x'.repeat(5_000) } })),
		chunkCalls: (...args: Parameters<typeof stage.chunkCalls>) => stage.chunkCalls(...args).map(p => ({ ...p, schema: { ...p.schema, description: 'x'.repeat(5_000) } })),
	})) };
	assert.throws(() => createReviewJob(adapter, 'daemon', snapshot, 4_000), AtomTooLargeError);
	const empty = toySnapshot([]);
	const noMaterial = toyAdapter(empty);
	const fixed = { ...noMaterial, stagesFor: () => noMaterial.stagesFor('daemon').map(stage => ({
		...stage, singleCalls: () => [{ messages: [{ role: 'user' as const, content: 'fixed context'.repeat(500) }], schema: {}, execution: { mode: 'structured' as const } }],
	})) };
	assert.throws(() => createReviewJob(fixed, 'daemon', empty, 4_000), /fixed framing/);

	const history = 'explicit previous correction '.repeat(40);
	const historySnapshot = toySnapshot(Array.from({ length: 20 }, (_, i) => atom(i, 200)));
	const historyBase = toyAdapter(historySnapshot);
	const withHistory = { ...historyBase, stagesFor: () => historyBase.stagesFor('daemon').map(stage => ({
		...stage,
		singleCalls: (...args: Parameters<typeof stage.singleCalls>) => stage.singleCalls(...args).map(p => ({ ...p, messages: [...p.messages, { role: 'assistant' as const, content: history }] })),
		chunkCalls: (...args: Parameters<typeof stage.chunkCalls>) => stage.chunkCalls(...args).map(p => ({ ...p, messages: [...p.messages, { role: 'assistant' as const, content: history }] })),
	})) };
	const limit = 4_000;
	const job = createReviewJob(withHistory, 'daemon', historySnapshot, limit);
	assert.equal(job.plan.single, false);
	let calls = 0;
	const provider = { completeStructured: async (messages: LLMMessage[], schema: StructuredSchema) => {
		calls++;
		assert.ok(messages.some(m => m.role === 'assistant' && m.content === history), 'history reaches actual dispatch intact');
		assert.ok(promptChars(messages, schema) <= limit, 'history and schema fit together');
		return { callId: (schema as { properties: { callId: { const: string } } }).properties.callId.const, answer: { seen: [] } };
	} } as unknown as LLMProvider;
	await runReviewJob(job, withHistory, provider);
	assert.ok(calls > 1, 'history is retained across divided calls');
});

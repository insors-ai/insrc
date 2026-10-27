import assert from 'node:assert/strict';
import { test } from 'node:test';
import { envelopeMessages, envelopeSchema, promptChars } from '../envelope.js';
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

test('DIFF-BUDGET: irreducible schema and explicit history are never omitted to fit', () => {
	const snapshot = toySnapshot([atom(1)]);
	const base = toyAdapter(snapshot);
	const adapter = { ...base, stagesFor: () => base.stagesFor('daemon').map(stage => ({
		...stage,
		singleCalls: (...args: Parameters<typeof stage.singleCalls>) => stage.singleCalls(...args).map(p => ({ ...p, schema: { ...p.schema, description: 'x'.repeat(5_000) } })),
		chunkCalls: (...args: Parameters<typeof stage.chunkCalls>) => stage.chunkCalls(...args).map(p => ({ ...p, schema: { ...p.schema, description: 'x'.repeat(5_000) } })),
	})) };
	assert.throws(() => createReviewJob(adapter, 'daemon', snapshot, 4_000), AtomTooLargeError);
	assert.ok(promptChars([{ role: 'assistant', content: 'previous correction '.repeat(100) }]) > 1_900);
});

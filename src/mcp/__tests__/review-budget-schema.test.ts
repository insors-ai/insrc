import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { z } from 'zod';
import { buildInsrcMcpServerWithRegistry } from '../server.js';
import { handleInsrcSchema } from '../schema/handler.js';
import { rawReviewCall } from '../../daemon/steps/review-step/__tests__/terminal-client.js';
import { CONTROLLER_DECLARATION } from '../../daemon/steps/code-review-step/__tests__/controller-client.js';

test('registered code-review declaration envelope and schema lookup match runtime contracts', async () => {
	const { server, schemaRegistry } = buildInsrcMcpServerWithRegistry();
	const [a, b] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: 'review-budget-schema-test', version: '1' });
	await server.connect(a); await client.connect(b);
	try {
		const advertised = (await client.listTools()).tools.find(t => t.name === 'insrc_code_review_step')!.inputSchema;
		const lookup = handleInsrcSchema({ tool: 'insrc_code_review_step', phase: 'judgements' }, schemaRegistry);
		assert.ok(!('error' in lookup));
		assert.deepEqual(advertised, lookup.schema, 'lookup is the actual registered MCP shape');
		assert.ok(advertised.properties!['reviewBudget']); assert.ok(advertised.properties!['reply']);
		const registration = schemaRegistry.get('insrc_code_review_step')!;
		const actual = z.object(registration.rawShape);
		const valid = { phase: 'judgements', state: 'opaque', reviewBudget: CONTROLLER_DECLARATION, reply: { version: 1, generation: 0, callId: '00000000-0000-4000-8000-000000000000', answer: { findings: [] } } };
		assert.equal(actual.safeParse(valid).success, true);
		for (const reply of [{ ...valid.reply, version: 0 }, { ...valid.reply, generation: -1 }, { ...valid.reply, callId: 'wrong' }]) assert.equal(actual.safeParse({ ...valid, reply }).success, false);
		assert.equal(actual.safeParse({ ...valid, reviewBudget: { ...CONTROLLER_DECLARATION, hostContextReserveTokens: -1 } }).success, false);
		assert.equal(actual.safeParse({ phase: 'start', epicHash: 'abc', storyId: 's1' }).success, true, 'daemon-routed reviews retain their optional public declaration');
	} finally { await client.close(); await server.close(); }
});


test('registered design-review phases validate declarations envelopes stale states and host-reserve qualification', async () => {
	const { server, schemaRegistry } = buildInsrcMcpServerWithRegistry();
	const [a, b] = InMemoryTransport.createLinkedPair();
	const client = new Client({ name: 'design-budget-schema-test', version: '1' });
	await server.connect(a); await client.connect(b);
	try {
		const advertised = (await client.listTools()).tools.find(t => t.name === 'insrc_review_step')!.inputSchema;
		const actual = z.object(schemaRegistry.get('insrc_review_step')!.rawShape);
		for (const phase of ['claims', 'findings', 'verdicts']) {
			const lookup = handleInsrcSchema({ tool: 'insrc_review_step', phase }, schemaRegistry);
			assert.ok(!('error' in lookup)); assert.deepEqual(advertised, lookup.schema);
			const valid = { phase, state: 'opaque', reviewBudget: CONTROLLER_DECLARATION, reply: { version: 1, generation: 0, callId: '00000000-0000-4000-8000-000000000000', answer: {} } };
			assert.equal(actual.safeParse(valid).success, true);
			for (const reply of [{ ...valid.reply, version: 0 }, { ...valid.reply, generation: -1 }, { ...valid.reply, callId: 'legacy' }]) assert.equal(actual.safeParse({ ...valid, reply }).success, false);
			assert.equal(actual.safeParse({ ...valid, reviewBudget: { ...CONTROLLER_DECLARATION, profile: { ...CONTROLLER_DECLARATION.profile, qualification: 'unknown' } } }).success, false);
			assert.equal(actual.safeParse({ ...valid, reviewBudget: { ...CONTROLLER_DECLARATION, hostContextReserveTokens: -1 } }).success, false);
		}
		assert.equal(actual.safeParse({ phase: 'start', artifact: 'LLD.md' }).success, true, 'daemon routing does not require a controller declaration');
		const stale = JSON.parse((await rawReviewCall({ phase: 'claims', state: 'stale-token', reviewBudget: CONTROLLER_DECLARATION, reply: { version: 1, generation: 0, callId: '00000000-0000-4000-8000-000000000000', answer: { claims: [] } } })).content[0]!.text);
		assert.equal(stale.next, 'error'); assert.equal(stale.error.code, 'review-budget-state-stale');
	} finally { await client.close(); await server.close(); }
});

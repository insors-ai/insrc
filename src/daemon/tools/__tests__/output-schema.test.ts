/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s2/t3: executeTool's input and output checks.
 * Run: npx tsx --test src/daemon/tools/__tests__/output-schema.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { executeTool } from '../executor.js';
import { _resetRegistryForTests, registerTool } from '../registry.js';
import { deps, fakeTool } from './_fakes.js';

const GOOD_IN = { name: 'a', count: 1 };
const GOOD_DATA = { id: 'x', total: 2 };

function setup() { _resetRegistryForTests(); }

test('output-schema.test.ts: valid input and valid data on a schematized tool pass through unchanged after the checks', async () => {
	setup();
	const result = { output: 'text for agents', format: 'text' as const, success: true, data: GOOD_DATA };
	const t = fakeTool('fake_ok', result); registerTool(t);
	const r = await executeTool('fake_ok', GOOD_IN, deps());
	assert.deepEqual(r, result);
	assert.equal(t.ran, 1);
});

test('output-schema.test.ts: the check runs before the result is returned to the caller', async () => {
	setup();
	const t = fakeTool('fake_order', { output: 'raw', format: 'text', success: true, data: { id: 1 } }); registerTool(t);
	const r = await executeTool('fake_order', GOOD_IN, deps());
	assert.equal(t.ran, 1, 'the tool ran');
	assert.equal(r.success, false, 'the unchecked result never reached the caller');
	assert.equal(r.failure?.kind, 'schema-mismatch');
});

test('output-schema.test.ts: input that does not fit the inputSchema returns rejected and the tool is not run', async () => {
	setup();
	const t = fakeTool('fake_in', { output: 'x', format: 'text', success: true, data: GOOD_DATA }); registerTool(t);
	const r = await executeTool('fake_in', { name: 5 }, deps());
	assert.equal(t.ran, 0);
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'rejected');
	assert.match(r.failure!.message, /fake_in/);
	assert.match(r.failure!.message, /name|count/);
});

test('output-schema.test.ts: data that does not fit returns schema-mismatch with the failing paths named, and data dropped', async () => {
	setup();
	const raw = 'R'.repeat(10_000);
	registerTool(fakeTool('fake_bad', { output: raw, format: 'text', success: true, data: { id: 'x', total: 'many' } }));
	const r = await executeTool('fake_bad', GOOD_IN, deps());
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'schema-mismatch');
	assert.match(r.failure!.message, /\/total/);
	assert.equal(r.data, undefined);
	assert.equal(r.output, r.failure!.message, 'output carries the message for agents');
	assert.ok(r.failure!.original !== undefined && r.failure!.original.length < raw.length, 'original is truncated');
	assert.ok(r.failure!.original!.startsWith('RRR'));
});

test('output-schema.test.ts: success without data on a schematized tool returns schema-mismatch', async () => {
	setup();
	registerTool(fakeTool('fake_nodata', { output: 'only text', format: 'text', success: true }));
	const r = await executeTool('fake_nodata', GOOD_IN, deps());
	assert.equal(r.failure?.kind, 'schema-mismatch');
	assert.match(r.failure!.message, /no data/);
	assert.equal(r.failure!.original, 'only text');
});

test('output-schema.test.ts: a failed result is not validated and passes through', async () => {
	setup();
	const failed = { output: 'boom', format: 'text' as const, success: false, error: 'boom', failure: { kind: 'unreachable' as const, message: 'boom' } };
	registerTool(fakeTool('fake_fail', failed));
	assert.deepEqual(await executeTool('fake_fail', GOOD_IN, deps()), failed);
});

test('output-schema.test.ts: a tool with no outputSchema is run and returned exactly as today, with its input unchecked', async () => {
	setup();
	const result = { output: 'plain', format: 'text' as const, success: true, data: { anything: 1 } };
	const t = fakeTool('fake_plain', result, { schemas: false }); registerTool(t);
	const r = await executeTool('fake_plain', { whatever: [1, 2] }, deps());
	assert.deepEqual(r, result);
	assert.equal(t.ran, 1);
});

test('output-schema.test.ts: a thrown error and an invalid schema each return a typed failure', async () => {
	setup();
	const thrower = fakeTool('fake_throw', () => { throw new Error('exploded'); }, { schemas: false }); registerTool(thrower);
	const a = await executeTool('fake_throw', {}, deps());
	assert.equal(a.success, false);
	assert.equal(a.failure?.kind, 'rejected');
	assert.equal(a.error, 'exploded');
	assert.equal(a.output, '[Tool failed] exploded');

	const badIn = fakeTool('fake_badin', { output: 'x', format: 'text', success: true, data: GOOD_DATA }, { inputSchema: { type: 'no-such-type' } }); registerTool(badIn);
	const b = await executeTool('fake_badin', GOOD_IN, deps());
	assert.equal(b.failure?.kind, 'rejected');
	assert.match(b.failure!.message, /invalid input or output schema/);
	assert.equal(badIn.ran, 0);

	registerTool(fakeTool('fake_badout', { output: 'x', format: 'text', success: true, data: GOOD_DATA }, { outputSchema: { type: 'no-such-type' } }));
	const c = await executeTool('fake_badout', GOOD_IN, deps());
	assert.equal(c.failure?.kind, 'rejected');
	assert.match(c.failure!.message, /invalid input or output schema/);

	const d = await executeTool('no_such_tool', {}, deps());
	assert.equal(d.failure?.kind, 'rejected');
	assert.equal(d.error, "No tool registered for 'no_such_tool'");
});

test('output-schema.test.ts: the validator for a schema object is compiled once across calls', async () => {
	setup();
	// ajv throws when a second schema object with the same $id is compiled; the same object is served from its cache.
	const id = { $id: 'urn:test:compiled-once', type: 'object', properties: { name: { type: 'string' } } };
	registerTool(fakeTool('fake_once', { output: 'x', format: 'text', success: true, data: GOOD_DATA }, { inputSchema: id }));
	for (let i = 0; i < 3; i++) {
		const r = await executeTool('fake_once', { name: 'a' }, deps());
		assert.equal(r.success, true);
	}
});

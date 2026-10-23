/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s2/t6: callTool at run time. The types are proved by
 * src/daemon/tools/call-tool.type-test.ts, which npm run build compiles; this file
 * checks that the values behave as those types say, with the same two definition shapes.
 * Run: npx tsx --test src/daemon/tools/__tests__/call-tool.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Type } from '@sinclair/typebox';

import { callTool } from '../call-tool.js';
import { _resetRegistryForTests, registerTool } from '../registry.js';
import type { ToolResult } from '../types.js';
import { deps } from './_fakes.js';

function typed(id: string, result: ToolResult) {
	return {
		id, description: 'fake',
		inputSchema: Type.Object({ name: Type.String() }),
		outputSchema: Type.Object({ count: Type.Number() }),
		async execute(): Promise<ToolResult> { return result; },
	};
}

test('call-tool.test.ts: the runtime values of the fake definitions are what the types say', async () => {
	_resetRegistryForTests();
	const tool = typed('ct_ok', { output: 'text', format: 'text', success: true, data: { count: 3 } });
	registerTool(tool);
	const r = await callTool(tool, { name: 'a' }, deps());
	assert.equal(r.success, true);
	if (r.success) {
		assert.equal(r.data.count, 3);
		assert.equal(r.output, 'text');
	}
});

test('call-tool.test.ts: TypedToolResult data is absent when success is false', async () => {
	_resetRegistryForTests();
	const mismatch = typed('ct_bad', { output: 'text', format: 'text', success: true, data: { count: 'many' } });
	const failing = typed('ct_fail', { output: 'down', format: 'text', success: false, error: 'down', failure: { kind: 'unreachable', message: 'down' } });
	const throwing = { ...typed('ct_throw', { output: '', format: 'text', success: true }), async execute(): Promise<ToolResult> { throw new Error('exploded'); } };
	for (const t of [mismatch, failing, throwing]) registerTool(t);

	const a = await callTool(mismatch, { name: 'a' }, deps());
	assert.equal(a.success, false);
	assert.equal('data' in a, false);
	assert.equal(!a.success && a.error.kind, 'schema-mismatch');

	const b = await callTool(failing, { name: 'a' }, deps());
	assert.equal('data' in b, false);
	assert.equal(!b.success && b.error.kind, 'unreachable');

	const c = await callTool(throwing, { name: 'a' }, deps());
	assert.equal(!c.success && c.error.kind, 'rejected');

	// A definition that was never registered is a failure, not a throw.
	const d = await callTool(typed('ct_unregistered', { output: '', format: 'text', success: true, data: { count: 1 } }), { name: 'a' }, deps());
	assert.equal(!d.success && d.error.kind, 'rejected');
	assert.match(!d.success ? d.error.message : '', /No tool registered/);
});

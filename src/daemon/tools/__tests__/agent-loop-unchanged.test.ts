/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s2/t3: the agent loop keeps reading output, success and error.
 * Run: npx tsx --test src/daemon/tools/__tests__/agent-loop-unchanged.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { runReadOnlyToolLoop } from '../../../agent/read-only-tool-loop.js';
import { _resetRegistryForTests, registerTool } from '../registry.js';
import { deps, fakeTool } from './_fakes.js';

/** A provider that asks for each scripted tool call in turn, then ends. */
function scripted(calls: Array<{ name: string; input: unknown }>) {
	let turn = 0;
	return {
		async complete() {
			if (turn < calls.length) {
				const c = calls[turn]!; turn += 1;
				return { text: '', stopReason: 'tool_use', toolCalls: [{ id: `call${turn}`, name: c.name, input: c.input }] };
			}
			return { text: 'done', stopReason: 'end_turn', toolCalls: [] };
		},
	} as never;
}

test('agent-loop-unchanged.test.ts: the agent loop path still receives output, success and error for a schematized tool and for a tool without a schema', async () => {
	_resetRegistryForTests();
	registerTool(fakeTool('fake_good', { output: 'good text', format: 'text', success: true, data: { id: 'x', total: 1 } }));
	registerTool(fakeTool('fake_bad', { output: 'long raw output', format: 'text', success: true, data: { id: 1 } }));
	registerTool(fakeTool('fake_plain', { output: 'plain text', format: 'text', success: true }, { schemas: false }));
	registerTool(fakeTool('fake_plain_fail', { output: 'plain failed', format: 'text', success: false, error: 'plain failed' }, { schemas: false }));

	const calls = [
		{ name: 'fake_good', input: { name: 'a', count: 1 } },
		{ name: 'fake_bad', input: { name: 'a', count: 1 } },
		{ name: 'fake_plain', input: {} },
		{ name: 'fake_plain_fail', input: {} },
	];
	const traces: Array<{ tool: string; ok: boolean; output: string }> = [];
	const res = await runReadOnlyToolLoop({
		provider: scripted(calls), messages: [{ role: 'user', content: 'go' }], tools: [],
		allow: new Set(calls.map(c => c.name)), deps: deps(), maxTurns: 10,
		onTrace: e => { if (e.type === 'tool-response') traces.push({ tool: e.tool, ok: e.ok, output: e.output }); },
	});
	assert.equal(res.done, true);
	assert.equal(traces.length, 4);
	assert.deepEqual(traces[0], { tool: 'fake_good', ok: true, output: 'good text' });
	assert.equal(traces[1]!.ok, false);
	assert.match(traces[1]!.output, /does not fit its output schema/);
	assert.deepEqual(traces[2], { tool: 'fake_plain', ok: true, output: 'plain text' });
	assert.deepEqual(traces[3], { tool: 'fake_plain_fail', ok: false, output: 'plain failed' });
});

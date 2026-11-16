/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s1 (sc1): the hook stage leaves the agent's read-only tool loop alone.
 * Run: npx tsx --test src/agent/__tests__/read-only-tool-loop.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { _resetToolHooksForTests, registerToolHook } from '../../daemon/tools/hooks.js';
import { _resetRegistryForTests, registerTool } from '../../daemon/tools/registry.js';
import { deps, fakeTool } from '../../daemon/tools/__tests__/_fakes.js';
import { runReadOnlyToolLoop } from '../read-only-tool-loop.js';

/** A provider that asks for one tool call, then ends. */
function oneCall(name: string) {
	let turn = 0;
	return {
		async complete() {
			if (turn++ === 0) return { text: '', stopReason: 'tool_use', toolCalls: [{ id: 'c1', name, input: {} }] };
			return { text: 'done', stopReason: 'end_turn', toolCalls: [] };
		},
	} as never;
}

async function run(name: string) {
	const seen: Array<{ ok: boolean; output: string }> = [];
	const res = await runReadOnlyToolLoop({
		provider: oneCall(name), messages: [{ role: 'user', content: 'go' }], tools: [],
		allow: new Set([name]), deps: deps(), maxTurns: 5,
		onTrace: e => { if (e.type === 'tool-response') seen.push({ ok: e.ok, output: e.output }); },
	});
	assert.equal(res.done, true);
	return seen;
}

test("read-only-tool-loop.test.ts: the read-only tool loop still returns the tool's output text unchanged when no rule is registered", async () => {
	_resetRegistryForTests(); _resetToolHooksForTests();
	registerTool(fakeTool('loop_plain', { output: 'plain text', format: 'text', success: true }, { schemas: false }));
	assert.deepEqual(await run('loop_plain'), [{ ok: true, output: 'plain text' }]);

	// a rule that passes changes nothing the agent reads; a rule that fails is told to the agent in the text
	registerToolHook({ id: 'passes', toolId: 'loop_plain', async run() {} });
	assert.deepEqual(await run('loop_plain'), [{ ok: true, output: 'plain text' }]);
	registerToolHook({ id: 'breaks', toolId: 'loop_plain', async run() { throw new Error('refresh failed'); } });
	assert.deepEqual(await run('loop_plain'), [{ ok: true, output: 'plain text\n[hook failed] breaks: refresh failed' }]);
	_resetRegistryForTests(); _resetToolHooksForTests();
});

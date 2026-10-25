import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Type } from '@sinclair/typebox';

import type { TypedTool } from '../../../call-tool.js';
import type { ToolResult } from '../../../types.js';
import { withGhFailureNet } from '../helpers.js';

const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };

function tool(execute: () => Promise<ToolResult>): TypedTool {
	return { id: 'gh_net_probe', description: 'probe', inputSchema: Type.Object({ n: Type.Number() }), outputSchema: Type.Object({ ok: Type.Boolean() }), execute } as TypedTool;
}

test('call-tool.type-test.ts: callTool over withGhFailureNet keeps the concrete input and result types', async () => {
	const throwing = withGhFailureNet(tool(async () => { throw new Error('boom'); }));
	const r = await throwing.execute({ n: 1 }, deps);
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'rejected');
	assert.equal(r.failure?.message, 'boom');

	const bare = withGhFailureNet(tool(async () => ({ output: 'x', format: 'text', success: false, error: 'nope' })));
	assert.equal((await bare.execute({ n: 1 }, deps)).failure?.message, 'nope');

	const own = { kind: 'timed-out' as const, message: 'slow' };
	const kept = withGhFailureNet(tool(async () => ({ output: 'x', format: 'text', success: false, failure: own })));
	assert.deepEqual((await kept.execute({ n: 1 }, deps)).failure, own);

	const ok = tool(async () => ({ output: 'x', format: 'text', success: true, data: { ok: true } }));
	const wrapped = withGhFailureNet(ok);
	assert.equal(wrapped.inputSchema, ok.inputSchema);
	assert.equal(wrapped.outputSchema, ok.outputSchema);
	assert.equal((await wrapped.execute({ n: 1 }, deps)).success, true);
});

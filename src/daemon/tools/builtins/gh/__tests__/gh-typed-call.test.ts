import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { Value } from '@sinclair/typebox/value';

import { callTool } from '../../../call-tool.js';
import { _setApprovalGateForTests } from '../../../executor.js';
import { _resetRegistryForTests, registerTool } from '../../../registry.js';
import type { ApprovalGate, ToolDeps } from '../../../types.js';
import { CASES } from './_cases.js';
import { installFakeGh } from './_fakegh.js';

const deps: ToolDeps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, approvalMode: 'auto' };

afterEach(() => { _setApprovalGateForTests(undefined); _resetRegistryForTests(); });

test('gh-typed-call.test.ts: the 46 existing tools called through typed callTool keep their concrete result types', async () => {
	_resetRegistryForTests();
	// a destructive call asks every time; the gate here approves, so the call runs
	const gate: ApprovalGate = { async ask(r) { return { requestId: r.requestId, decision: 'approve' }; } };
	_setApprovalGateForTests(() => gate);
	const seen = new Set<string>();
	for (const [tool, input, stdout, logs] of CASES) {
		registerTool(tool);
		seen.add(tool.id);
		const ok = installFakeGh('ok', stdout, logs);
		try {
			const r = await callTool(tool, input as never, deps);
			assert.equal(r.success, true, `${tool.id}: ${r.output}`);
			if (r.success) { assert.ok(Value.Check(tool.outputSchema, r.data), `${tool.id} data fits its output schema`); }
		} finally { ok.restore(); }
		const bad = installFakeGh('fail404');
		try {
			const r = await callTool(tool, input as never, deps);
			assert.equal(r.success, false, tool.id);
			if (!r.success) { assert.equal(r.error.kind, 'rejected', tool.id); assert.match(r.error.message, /HTTP 404: not found/, tool.id); }
		} finally { bad.restore(); }
	}
	assert.equal(seen.size, 46);
});

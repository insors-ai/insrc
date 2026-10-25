import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Value } from '@sinclair/typebox/value';

import { resolveApprovalClass } from '../../../approval-policy.js';
import { executeTool } from '../../../executor.js';
import { registerTool } from '../../../registry.js';
import { ghApprovalClass } from '../helpers.js';
import { CASES } from './_cases.js';
import { installFakeGh } from './_fakegh.js';

const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };

test('gh-output-schemas.test.ts: issue and pr tool results validate against their output schemas for success and failure', async () => {
	assert.equal(CASES.length, 50);
	for (const [tool] of CASES) {
		// the class a tool declares is the one ghApprovalClass gives its id
		if (tool.approval !== undefined) { assert.equal(resolveApprovalClass(tool, {}), ghApprovalClass(tool.id, {}), tool.id); }
	}
	for (const [tool, input, stdout, logs] of CASES) {
		const ok = installFakeGh('ok', stdout, logs);
		try {
			const r = await tool.execute(input, deps);
			assert.equal(r.success, true, `${tool.id}: ${r.output}`);
			assert.ok(Value.Check(tool.outputSchema!, r.data), `${tool.id} data ${JSON.stringify(r.data)} does not match its output schema`);
		} finally { ok.restore(); }

		const bad = installFakeGh('fail404');
		try {
			const r = await tool.execute(input, deps);
			assert.equal(r.success, false, tool.id);
			assert.equal(r.failure?.kind, 'rejected', tool.id);
			// the legacy text stays in output and error
			assert.equal(r.error, 'HTTP 404: not found', tool.id);
			assert.equal(r.output, `[${tool.id}] HTTP 404: not found`, tool.id);
			// a failure carries no data, so the output schema does not apply to it
			assert.equal(r.data, undefined, tool.id);
		} finally { bad.restore(); }
	}

	// and through the executor, which checks a success against the output schema and returns a failure as the typed failure, never as a schema mismatch
	for (const [tool, input, stdout, logs] of CASES) {
		if (ghApprovalClass(tool.id, {}) === 'destructive') { continue; } // asks the person every time; the direct run above covers it
		registerTool(tool);
		const callDeps = { ...deps, approvalMode: 'auto' as const };
		const ok = installFakeGh('ok', stdout, logs);
		try {
			const r = await executeTool(tool.id, input, callDeps);
			assert.equal(r.success, true, `${tool.id}: ${r.output}`);
			assert.ok(Value.Check(tool.outputSchema!, r.data), tool.id);
		} finally { ok.restore(); }
		const bad = installFakeGh('fail404');
		try {
			const r = await executeTool(tool.id, input, callDeps);
			assert.equal(r.success, false, tool.id);
			assert.equal(r.failure?.kind, 'rejected', tool.id);
		} finally { bad.restore(); }
	}
});

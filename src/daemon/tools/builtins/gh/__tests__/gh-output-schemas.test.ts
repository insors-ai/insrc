import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Value } from '@sinclair/typebox/value';

import { resolveApprovalClass } from '../../../approval-policy.js';
import { executeTool } from '../../../executor.js';
import { registerTool } from '../../../registry.js';
import { ghApprovalClass } from '../helpers.js';
import { CASES } from './_cases.js';
import { ROWS, ROWS2, ROWS3 } from './_family-rows.js';
import { providers } from './_providers.js';
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

test('gh-output-schemas.test.ts: every output of a family tool carries the literal op and validates for success and failure', async () => {
	const deps = { sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0 };
	const rows = [...ROWS, ...ROWS2, ...ROWS3];
	const ops = new Set<string>();
	for (const [tool, input, , stdout, , , answer] of rows.map(r => [r[0], r[1], r[2], r[3], r[4], r[5], (r as { 6?: unknown })[6]] as const)) {
		ops.add(`${tool.id}.${String(input['op'])}`);
		const ok = installFakeGh('stdin', stdout);
		try {
			const p = answer !== undefined ? providers(answer) : undefined;
			const r = await tool.execute(input, { ...deps, ...(p ? { conversion: p.conversion } : {}) });
			assert.equal(r.success, true, `${tool.id}.${String(input['op'])}: ${r.output}`);
			const data = r.data as Record<string, unknown>;
			assert.equal(data['op'], input['op'], 'the literal op');
			assert.ok(Value.Check(tool.outputSchema, data), `${tool.id}.${String(input['op'])} success fits the output union`);
			// the output union picks its member by the literal op: the same data under another op does not fit
			assert.equal(Value.Check(tool.outputSchema, { ...data, op: '__other__' }), false);
		} finally { ok.restore(); }
		const bad = installFakeGh('fail404');
		try {
			const p = answer !== undefined ? providers(answer) : undefined;
			const r = await tool.execute(input, { ...deps, ...(p ? { conversion: p.conversion } : {}) });
			assert.equal(r.success, false, `${tool.id}.${String(input['op'])} fails when gh fails`);
			assert.equal(r.failure?.kind, 'rejected');
			assert.equal(r.data, undefined, 'a failure carries no data');
		} finally { bad.restore(); }
	}
	// every op of the 22 family tools was exercised
	for (const id of new Set(rows.map(r => r[0]))) {
		for (const op of id.ops) { assert.ok(ops.has(`${id.id}.${op.name}`), `${id.id}.${op.name} is exercised`); }
	}
});

test('gh-output-schemas.test.ts: the hosts output schema validates a real-shape sample and rejects a sample without login', async () => {
	const { ghAuthTool } = await import('../account.js');
	const good = { op: 'hosts', hosts: { 'github.com': [{ state: 'success', login: 'octocat', active: true, tokenSource: 'keyring' }] } };
	assert.ok(Value.Check(ghAuthTool.outputSchema!, good));
	assert.ok(Value.Check(ghAuthTool.outputSchema!, { op: 'hosts', hosts: {} }));
	assert.ok(!Value.Check(ghAuthTool.outputSchema!, { op: 'hosts', hosts: { 'github.com': [{ state: 'success' }] } }));
});

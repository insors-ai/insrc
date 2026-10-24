/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s3/t6: executeTool asks before it runs. The gate is a fake here;
 * the real broker and socket are covered by approval-broker.test.ts and approval-ipc.test.ts.
 * Every common-class call below carries its own approvalMode, so no test reads the user's config.
 * Run: npx tsx --test src/daemon/tools/__tests__/executor-approval.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { _setApprovalGateForTests, executeTool } from '../executor.js';
import { _resetRegistryForTests, registerTool } from '../registry.js';
import type { ApprovalAnswer, ApprovalClass, ApprovalDenial, ApprovalGate, ApprovalRequest, Tool, ToolDeps, ToolResult } from '../types.js';
import { InSchema, OutSchema, deps as baseDeps } from './_fakes.js';

const OK: ToolResult = { output: 'did it', format: 'text', success: true, data: { id: 'x', total: 1 } };

interface Fake extends Tool { ran: number }
function tool(id: string, approval: ApprovalClass, extra: Partial<Tool> = {}): Fake {
	const t = { id, description: 'fake', ran: 0, inputSchema: { type: 'object' }, approval, async execute() { t.ran += 1; return OK; }, ...extra } as Fake;
	return t;
}

/** A gate that records every request and answers from a script. */
function gate(answer: (r: ApprovalRequest) => ApprovalAnswer | ApprovalDenial) {
	const requests: ApprovalRequest[] = [];
	const g: ApprovalGate = { async ask(r) { requests.push(r); return answer(r); } };
	_setApprovalGateForTests(() => g);
	return requests;
}
const approve = (r: ApprovalRequest): ApprovalAnswer => ({ requestId: r.requestId, decision: 'approve' });
const deps = (extra: Partial<ToolDeps> = {}): ToolDeps => ({ ...baseDeps(), ...extra });

afterEach(() => { _setApprovalGateForTests(undefined); _resetRegistryForTests(); });

test('executor-approval.test.ts: a declined call returns a denied failure with reason declined and execute is never called', async () => {
	_resetRegistryForTests();
	const t = tool('ap_destructive', 'destructive'); registerTool(t);
	const requests = gate(() => 'declined');
	const r = await executeTool('ap_destructive', { cwd: '/work/repo', force: true }, deps());
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'denied');
	assert.equal(r.failure?.denial, 'declined');
	assert.match(r.output, /declined ap_destructive/);
	assert.equal(t.ran, 0);
	assert.equal(requests.length, 1);
	assert.equal(requests[0]!.repoPath, '/work/repo');
	assert.deepEqual(requests[0]!.arguments, { cwd: '/work/repo', force: true });
});

test('executor-approval.test.ts: a timed-out call returns a denied failure with reason timed-out and the tool is not run', async () => {
	_resetRegistryForTests();
	const t = tool('ap_destructive', 'destructive'); registerTool(t);
	gate(() => 'timed-out');
	const r = await executeTool('ap_destructive', {}, deps());
	assert.equal(r.failure?.kind, 'denied');
	assert.equal(r.failure?.denial, 'timed-out');
	assert.match(r.output, /nobody answered/);
	assert.equal(t.ran, 0);
});

test('executor-approval.test.ts: no client and a cancelled request return denied with their reasons', async () => {
	_resetRegistryForTests();
	const t = tool('ap_destructive', 'destructive'); registerTool(t);
	for (const reason of ['no-client', 'cancelled'] as const) {
		gate(() => reason);
		const r = await executeTool('ap_destructive', {}, deps());
		assert.equal(r.failure?.kind, 'denied');
		assert.equal(r.failure?.denial, reason);
	}
	// a gate that throws is treated as no client: the call is denied, never run
	_setApprovalGateForTests(() => ({ ask: async () => { throw new Error('broker exploded'); } }));
	const thrown = await executeTool('ap_destructive', {}, deps());
	assert.equal(thrown.failure?.denial, 'no-client');
	assert.equal(t.ran, 0);
});

test("executor-approval.test.ts: an approved call runs and returns the tool's result unchanged", async () => {
	_resetRegistryForTests();
	const t = tool('ap_destructive', 'destructive'); registerTool(t);
	gate(approve);
	assert.deepEqual(await executeTool('ap_destructive', {}, deps()), OK);
	assert.equal(t.ran, 1);

	// the common class: a call mode of auto runs without asking, manual and edit-auto ask
	const common = tool('ap_common', 'common'); registerTool(common);
	const requests = gate(approve);
	assert.deepEqual(await executeTool('ap_common', {}, deps({ approvalMode: 'auto' })), OK);
	assert.equal(requests.length, 0);
	for (const mode of ['manual', 'edit-auto'] as const) {
		assert.deepEqual(await executeTool('ap_common', {}, deps({ approvalMode: mode })), OK);
	}
	assert.equal(requests.length, 2);
	assert.equal(requests[0]!.approvalClass, 'common');

	// none never asks
	const none = tool('ap_none', 'none'); registerTool(none);
	assert.deepEqual(await executeTool('ap_none', {}, deps({ approvalMode: 'manual' })), OK);
	assert.equal(requests.length, 2);
});

test('executor-approval.test.ts: a second destructive call after an approved one raises its own request with a new id', async () => {
	_resetRegistryForTests();
	registerTool(tool('ap_destructive', 'destructive')); registerTool(tool('ap_other_destructive', 'destructive'));
	const requests = gate(approve);
	await executeTool('ap_destructive', { n: 1 }, deps());
	await executeTool('ap_destructive', { n: 1 }, deps());
	await executeTool('ap_other_destructive', { n: 2 }, deps({ caller: 'daemon', approvalMode: 'auto' }));
	assert.equal(requests.length, 3, 'every call asked, nothing was remembered');
	assert.equal(new Set(requests.map(r => r.requestId)).size, 3, 'each with its own id');
});

test('executor-approval.test.ts: a bad input is rejected before any prompt', async () => {
	_resetRegistryForTests();
	const t = tool('ap_typed', 'destructive', { inputSchema: InSchema as never, outputSchema: OutSchema as never }); registerTool(t);
	const requests = gate(approve);
	const r = await executeTool('ap_typed', { name: 5 }, deps());
	assert.equal(r.failure?.kind, 'rejected');
	assert.equal(requests.length, 0, 'no prompt for a call that cannot go ahead');
	assert.equal(t.ran, 0);
});

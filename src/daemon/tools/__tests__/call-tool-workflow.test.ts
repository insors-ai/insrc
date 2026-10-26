/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t10: callTool with caller 'workflow' runs a rule registered on the tool and
 * follows the approval rules for a common and a destructive tool.
 * Run: npx tsx --test src/daemon/tools/__tests__/call-tool-workflow.test.ts
 */

import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { callTool } from '../call-tool.js';
import type { TypedTool } from '../call-tool.js';
import { _setApprovalGateForTests } from '../executor.js';
import { _resetToolHooksForTests, registerToolHook } from '../hooks.js';
import { _resetRegistryForTests, registerTool } from '../registry.js';
import type { ApprovalGate, ApprovalRequest, ToolDeps } from '../types.js';
import { InSchema, OutSchema, fakeTool } from './_fakes.js';

const OUT = { output: 'ok', format: 'text' as const, success: true, data: { id: 'a', total: 1 } };
const IN = { name: 'n', count: 1 };
const deps = (extra: Partial<ToolDeps> = {}): ToolDeps => ({ sessionId: 's', repoPath: '/tmp', send: () => {}, requestId: 1, caller: 'workflow', ...extra });
let ranCount = 0;
const typed = (id: string, approval: 'common' | 'destructive'): TypedTool => {
	const t = fakeTool(id, OUT);
	return { ...t, approval, async execute(...a: Parameters<typeof t.execute>) { ranCount++; return t.execute(...a); }, inputSchema: InSchema, outputSchema: OutSchema } as TypedTool;
};

function gate(decision: 'approve' | 'declined' | 'timed-out'): { gate: ApprovalGate; requests: ApprovalRequest[] } {
	const requests: ApprovalRequest[] = [];
	return {
		requests,
		gate: { async ask(r) { requests.push(r); return decision === 'approve' ? { requestId: r.requestId, decision: 'approve' } : decision; } },
	};
}

beforeEach(() => { ranCount = 0; _resetToolHooksForTests(); _resetRegistryForTests(); });
afterEach(() => { _resetToolHooksForTests(); _resetRegistryForTests(); _setApprovalGateForTests(undefined); });

test('call-tool-workflow.test.ts: a rule registered on a tool runs for a callTool call with caller workflow as for agent', async () => {
	const t = typed('cw_hook', 'common'); registerTool(t);
	const callers: unknown[] = [];
	registerToolHook({ id: 'h', toolId: 'cw_hook', async run(ctx) { callers.push(ctx.caller); } });
	assert.equal((await callTool(t, IN, deps({ caller: 'workflow' }))).success, true);
	assert.equal((await callTool(t, IN, deps({ caller: 'agent' }))).success, true);
	assert.deepEqual(callers, ['workflow', 'agent']);
});

test('call-tool-workflow.test.ts: callTool with caller workflow runs the hook, honours manual and edit-auto for a common tool and always asks for a destructive one', async () => {
	const common = typed('cw_common', 'common'); const destructive = typed('cw_destroy', 'destructive');
	registerTool(common); registerTool(destructive);
	const ran: string[] = [];
	registerToolHook({ id: 'h1', toolId: 'cw_common', async run() { ran.push('common'); } });
	registerToolHook({ id: 'h2', toolId: 'cw_destroy', async run() { ran.push('destroy'); } });
	const g = gate('approve'); _setApprovalGateForTests(() => g.gate);
	for (const mode of ['manual', 'edit-auto'] as const) {
		g.requests.length = 0;
		assert.equal((await callTool(common, IN, deps({ approvalMode: mode }))).success, true);
		assert.equal(g.requests.length, 1, `${mode} asks for a common tool`);
	}
	g.requests.length = 0;
	await callTool(common, IN, deps({ approvalMode: 'auto' }));
	assert.equal(g.requests.length, 0, 'auto does not ask for a common tool');
	await callTool(destructive, IN, deps({ approvalMode: 'auto' }));
	assert.equal(g.requests.length, 1, 'a destructive tool asks even in auto');
	assert.deepEqual(ran, ['common', 'common', 'common', 'destroy']);
});

test('call-tool-workflow.test.ts: a destructive callTool with a gate that times out returns a denied failure and the caller does not continue', async () => {
	const destructive = typed('cw_timeout', 'destructive'); registerTool(destructive);
	let hookRan = false;
	registerToolHook({ id: 'h', toolId: 'cw_timeout', async run() { hookRan = true; } });
	const g = gate('timed-out'); _setApprovalGateForTests(() => g.gate);
	const r = await callTool(destructive, IN, deps());
	assert.equal(r.success, false);
	if (!r.success) { assert.equal(r.error.kind, 'denied'); assert.equal((r.error as { denial?: string }).denial, 'timed-out'); }
	assert.equal(ranCount, 0, 'the tool did not run');
	assert.equal(hookRan, false, 'no rule runs for a call that did not happen');
});

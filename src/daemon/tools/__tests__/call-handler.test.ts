/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t10: the tools.call stream handler, with the daemon's real approval broker.
 * Run: npx tsx --test src/daemon/tools/__tests__/call-handler.test.ts
 */

import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { approvalBroker } from '../../approval.js';
import type { ApprovalGateFrame, IpcStreamMessage, ToolsCallDone } from '../../../shared/types.js';
import { toolsCall } from '../call-handler.js';
import { _setApprovalGateForTests } from '../executor.js';
import { _resetToolHooksForTests, registerToolHook } from '../hooks.js';
import { _resetRegistryForTests, registerTool } from '../registry.js';
import { currentToolSignal } from '../tool-signal.js';
import type { Tool, ToolDeps, ToolResult } from '../types.js';

const OK: ToolResult = { output: 'ok', format: 'text', success: true };
const tool = (id: string, extra: Partial<Tool> = {}): Tool => ({ id, description: 'fake', inputSchema: { type: 'object' }, approval: 'none', async execute() { return OK; }, ...extra } as Tool);
const good = (toolId: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({ toolId, input: {}, repoPath: '/tmp', caller: 'agent', ...extra });

async function run(params: unknown, ctx?: { connectionIdentity: string }, signal = new AbortController().signal): Promise<IpcStreamMessage[]> {
	const frames: IpcStreamMessage[] = [];
	await toolsCall(params, m => frames.push(m), signal, ctx === undefined ? undefined : { connectionIdentity: ctx.connectionIdentity, daemonEpoch: 'e' });
	return frames;
}
const doneOf = (frames: IpcStreamMessage[]): ToolsCallDone => frames.find(f => f.stream === 'done')!.data as ToolsCallDone;

beforeEach(() => { _resetToolHooksForTests(); _resetRegistryForTests(); _setApprovalGateForTests(undefined); });
afterEach(() => { _resetToolHooksForTests(); _resetRegistryForTests(); _setApprovalGateForTests(undefined); });

test('call-handler.test.ts: invalid params (an invalid caller, a missing field, a non-object input) give one error frame and run nothing', async () => {
	let ran = 0;
	registerTool(tool('ch_inv', { async execute() { ran++; return OK; } }));
	const bad: unknown[] = [
		good('ch_inv', { caller: 'user' }), { toolId: 'ch_inv', input: {}, caller: 'agent' }, good('ch_inv', { input: 'x' }),
		good('ch_inv', { input: [] }), good('ch_inv', { approvalMode: 'sometimes' }), null, 'text',
	];
	for (const p of bad) {
		const frames = await run(p);
		assert.equal(frames.length, 1, JSON.stringify(p));
		assert.equal(frames[0]!.stream, 'error');
		assert.equal((frames[0]!.data as { code: string }).code, 'invalid-params');
	}
	assert.equal(ran, 0);
});

test('call-handler.test.ts: ToolDeps carry the validated params and sessionId tools-call: plus the connection identity, or tools-call without a context', async () => {
	let seen: ToolDeps | undefined;
	registerTool(tool('ch_deps', { async execute(_i: unknown, d: ToolDeps) { seen = d; return OK; } }));
	await run(good('ch_deps', { caller: 'workflow', approvalMode: 'manual', repoPath: '/work/r' }), { connectionIdentity: 'conn-7' });
	assert.equal(seen?.sessionId, 'tools-call:conn-7');
	assert.equal(seen?.repoPath, '/work/r');
	assert.equal(seen?.caller, 'workflow');
	assert.equal(seen?.approvalMode, 'manual');
	assert.equal(seen?.connectionExecution, undefined, 'never taken from params');
	await run(good('ch_deps', { connectionExecution: { forged: true } }));
	assert.equal(seen?.sessionId, 'tools-call');
	assert.equal(seen?.connectionExecution, undefined);
});

test('call-handler.test.ts: one done frame carries the ToolResult, and an unknown tool is a done frame with a rejected failure, not an error', async () => {
	registerTool(tool('ch_one', { async execute() { return { ...OK, output: 'hello' }; } }));
	const frames = await run(good('ch_one'));
	assert.deepEqual(frames.map(f => f.stream), ['done']);
	assert.equal(doneOf(frames).result.output, 'hello');
	const unknown = await run(good('ch_nope'));
	assert.deepEqual(unknown.map(f => f.stream), ['done']);
	assert.equal(doneOf(unknown).result.success, false);
	assert.equal(doneOf(unknown).result.failure?.kind, 'rejected');
});

test('call-handler.test.ts: tool progress frames go to the stream before the done frame', async () => {
	registerTool(tool('ch_prog', { async execute(_i: unknown, d: ToolDeps) { d.send({ id: 0, stream: 'progress', data: 'half' }); return OK; } }));
	assert.deepEqual((await run(good('ch_prog'))).map(f => f.stream), ['progress', 'done']);
});

test('call-handler.test.ts: no approval.subscribe client denies a destructive call with no-client and the done frame carries the denial', async () => {
	let ran = 0;
	registerTool(tool('ch_destroy', { approval: 'destructive', async execute() { ran++; return OK; } }));
	const r = doneOf(await run(good('ch_destroy'))).result;
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'denied');
	assert.equal((r.failure as { denial?: string }).denial, 'no-client');
	assert.equal(ran, 0);
});

test('call-handler.test.ts: an approval request reaches an approval.subscribe client and its answer lets the call run', async () => {
	registerTool(tool('ch_ask', { approval: 'destructive' }));
	const frames: ApprovalGateFrame[] = [];
	const close = approvalBroker.subscribe(f => {
		frames.push(f as ApprovalGateFrame);
		if (f.type === 'request') approvalBroker.answer(f.request.requestId, 'approve');
	});
	try {
		const r = doneOf(await run(good('ch_ask'))).result;
		assert.equal(r.success, true);
		const req = frames.find(f => f.type === 'request');
		assert.equal(req?.type === 'request' && req.request.toolId, 'ch_ask');
	} finally { close(); }
});

test('call-handler.test.ts: closing the stream aborts the signal and resolves a pending approval as cancelled', async () => {
	let ran = 0;
	registerTool(tool('ch_cancel', { approval: 'destructive', async execute() { ran++; return OK; } }));
	const seen: ApprovalGateFrame[] = [];
	const close = approvalBroker.subscribe(f => { seen.push(f as ApprovalGateFrame); });
	try {
		const ctl = new AbortController();
		const pending = run(good('ch_cancel'), undefined, ctl.signal);
		await new Promise(r => setTimeout(r, 50));
		assert.equal(approvalBroker.pendingCount, 1);
		const t0 = Date.now();
		ctl.abort();
		const r = doneOf(await pending).result;
		assert.ok(Date.now() - t0 < 1000, 'resolved at once, not after the approval time-out');
		assert.equal((r.failure as { denial?: string }).denial, 'cancelled');
		assert.equal(ran, 0);
		assert.equal(approvalBroker.pendingCount, 0);
	} finally { close(); }
});

test('call-handler.test.ts: a registered hook runs for a tools.call with caller workflow as for agent, and runs outside the signal context', async () => {
	registerTool(tool('ch_hook'));
	const seen: Array<{ caller: unknown; signal: AbortSignal | undefined }> = [];
	registerToolHook({ id: 'h', toolId: 'ch_hook', async run(ctx: { caller?: unknown }) { seen.push({ caller: ctx.caller, signal: currentToolSignal() }); } } as never);
	await run(good('ch_hook', { caller: 'agent' }));
	await run(good('ch_hook', { caller: 'workflow' }));
	assert.equal(seen.length, 2);
	assert.deepEqual(seen.map(s => s.caller), ['agent', 'workflow']);
	assert.ok(seen.every(s => s.signal === undefined));
});

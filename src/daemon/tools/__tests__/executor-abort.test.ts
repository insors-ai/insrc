/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t1: executeTool stops at every point where its effective signal is aborted.
 * Run: npx tsx --test src/daemon/tools/__tests__/executor-abort.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { _setApprovalGateForTests, executeTool } from '../executor.js';
import { _resetRegistryForTests, registerTool } from '../registry.js';
import { currentToolSignal } from '../tool-signal.js';
import type { ApprovalAnswer, ApprovalClass, ApprovalDenial, ApprovalGate, ApprovalRequest, Tool, ToolDeps, ToolResult } from '../types.js';
import { deps as baseDeps } from './_fakes.js';

const OK: ToolResult = { output: 'did it', format: 'text', success: true };

interface Fake extends Tool { ran: number; sawSignal?: AbortSignal | undefined }
function tool(id: string, approval: ApprovalClass, extra: Partial<Tool> = {}): Fake {
	const t = { id, description: 'fake', ran: 0, inputSchema: { type: 'object' }, approval, async execute() { t.ran += 1; t.sawSignal = currentToolSignal(); return OK; }, ...extra } as Fake;
	return t;
}
function gate(answer: (r: ApprovalRequest, signal: AbortSignal | undefined) => Promise<ApprovalAnswer | ApprovalDenial> | ApprovalAnswer | ApprovalDenial) {
	const requests: ApprovalRequest[] = [];
	const g: ApprovalGate = { async ask(r, signal) { requests.push(r); return answer(r, signal); } };
	_setApprovalGateForTests(() => g);
	return requests;
}
const approve = (r: ApprovalRequest): ApprovalAnswer => ({ requestId: r.requestId, decision: 'approve' });
const deps = (extra: Partial<ToolDeps> = {}): ToolDeps => ({ ...baseDeps(), ...extra });

afterEach(() => { _setApprovalGateForTests(undefined); _resetRegistryForTests(); });

test('executor-abort.test.ts: an already-aborted signal returns denied cancelled, asks nobody and never starts the tool', async () => {
	_resetRegistryForTests();
	const t = tool('ab_destructive', 'destructive'); registerTool(t);
	const none = tool('ab_none', 'none'); registerTool(none);
	const requests = gate(approve);
	const c = new AbortController(); c.abort();
	for (const id of ['ab_destructive', 'ab_none']) {
		const r = await executeTool(id, {}, deps({ signal: c.signal }));
		assert.equal(r.success, false);
		assert.equal(r.failure?.kind, 'denied');
		assert.equal(r.failure?.denial, 'cancelled');
	}
	assert.equal(t.ran + none.ran, 0);
	assert.equal(requests.length, 0);
});

test('executor-abort.test.ts: an abort during preview construction returns cancelled before any ask', async () => {
	_resetRegistryForTests();
	const c = new AbortController();
	const t = tool('ab_preview', 'destructive', { async buildApprovalGate() { c.abort(); return { title: 't', content: 'c' } as never; } });
	registerTool(t);
	const requests = gate(approve);
	const r = await executeTool('ab_preview', {}, deps({ signal: c.signal }));
	assert.equal(r.failure?.denial, 'cancelled');
	assert.equal(requests.length, 0);
	assert.equal(t.ran, 0);
});

test('executor-abort.test.ts: the preview runs inside the effective signal and the tool sees it', async () => {
	_resetRegistryForTests();
	const c = new AbortController();
	let previewSaw: AbortSignal | undefined;
	const t = tool('ab_ctx', 'destructive', { async buildApprovalGate() { previewSaw = currentToolSignal(); return { title: 't', content: 'c' } as never; } });
	registerTool(t);
	gate(approve);
	const r = await executeTool('ab_ctx', {}, deps({ signal: c.signal }));
	assert.equal(r.success, true);
	assert.equal(previewSaw, c.signal);
	assert.equal(t.sawSignal, c.signal);
});

test('executor-abort.test.ts: an abort between the approval answer and execute returns denied cancelled and the tool does not run', async () => {
	_resetRegistryForTests();
	const t = tool('ab_after', 'destructive'); registerTool(t);
	const c = new AbortController();
	gate(r => { c.abort(); return approve(r); });
	const r = await executeTool('ab_after', {}, deps({ signal: c.signal }));
	assert.equal(r.failure?.kind, 'denied');
	assert.equal(r.failure?.denial, 'cancelled');
	assert.equal(t.ran, 0);
});

test('executor-abort.test.ts: the broker is asked with the effective signal, so a nested call with no signal of its own is cancelled while it waits', async () => {
	_resetRegistryForTests();
	const nested = tool('ab_nested', 'destructive'); registerTool(nested);
	let nestedResult: ToolResult | undefined;
	const outerCtl = new AbortController();
	const outer = tool('ab_outer', 'none', {
		async execute(_i, d) {
			const p = executeTool('ab_nested', {}, { ...d, signal: undefined });
			setImmediate(() => outerCtl.abort());
			nestedResult = await p;
			return OK;
		},
	});
	registerTool(outer);
	// The fake gate resolves 'cancelled' only if it is handed a signal that aborts; otherwise it never answers.
	gate((_r, signal) => new Promise(resolve => {
		if (signal === undefined) return; // would hang: the test would time out
		signal.addEventListener('abort', () => resolve('cancelled'), { once: true });
	}));
	await executeTool('ab_outer', {}, deps({ signal: outerCtl.signal }));
	assert.equal(nestedResult?.failure?.denial, 'cancelled');
	assert.equal(nested.ran, 0);
});

test('executor-abort.test.ts: a call with no signal anywhere behaves as before', async () => {
	_resetRegistryForTests();
	const t = tool('ab_plain', 'destructive'); registerTool(t);
	const requests = gate(approve);
	const r = await executeTool('ab_plain', {}, deps());
	assert.equal(r.success, true);
	assert.equal(t.ran, 1);
	assert.equal(t.sawSignal, undefined);
	assert.equal(requests.length, 1);
});

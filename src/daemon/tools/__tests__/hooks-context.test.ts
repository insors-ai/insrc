/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t1: hooks run outside every tool call's signal context, nested calls included.
 * Run: npx tsx --test src/daemon/tools/__tests__/hooks-context.test.ts
 */

import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { _setApprovalGateForTests, executeTool } from '../executor.js';
import { _resetToolHooksForTests, registerToolHook } from '../hooks.js';
import { _resetRegistryForTests, registerTool } from '../registry.js';
import { currentToolSignal } from '../tool-signal.js';
import type { Tool, ToolDeps, ToolResult } from '../types.js';
import { deps as baseDeps } from './_fakes.js';

const OK: ToolResult = { output: 'ok', format: 'text', success: true };
const tick = (): Promise<void> => new Promise(r => setImmediate(r));
const plain = (id: string, extra: Partial<Tool> = {}): Tool => ({ id, description: 'fake', inputSchema: { type: 'object' }, approval: 'none', async execute() { return OK; }, ...extra } as Tool);

beforeEach(() => { _resetToolHooksForTests(); _resetRegistryForTests(); });
afterEach(() => { _resetToolHooksForTests(); _resetRegistryForTests(); _setApprovalGateForTests(undefined); });

test('hooks-context.test.ts: a hook of a directly called tool sees no signal before and after an await', async () => {
	registerTool(plain('hk_direct'));
	const seen: Array<AbortSignal | undefined> = [];
	registerToolHook({ id: 'h', toolId: 'hk_direct', async run() { seen.push(currentToolSignal()); await tick(); seen.push(currentToolSignal()); } });
	const c = new AbortController();
	const r = await executeTool('hk_direct', {}, { ...baseDeps(), signal: c.signal });
	assert.equal(r.success, true);
	assert.deepEqual(seen, [undefined, undefined]);
});

test('hooks-context.test.ts: a hook of a NESTED executeTool sees no signal before and after an await, and its subprocess-like work is not cancelled by the outer abort', async () => {
	registerTool(plain('hk_inner'));
	const seen: Array<AbortSignal | undefined> = [];
	let hookCompleted = false;
	const outerCtl = new AbortController();
	registerToolHook({
		id: 'h', toolId: 'hk_inner',
		async run() {
			seen.push(currentToolSignal());
			outerCtl.abort();                 // the outer call is cancelled while the hook runs
			await tick();
			seen.push(currentToolSignal());
			hookCompleted = true;
		},
	});
	registerTool(plain('hk_outer', {
		async execute(_i: unknown, d: ToolDeps) { const inner = await executeTool('hk_inner', {}, { ...d, signal: undefined }); return { ...OK, data: inner.success }; },
	}));
	const r = await executeTool('hk_outer', {}, { ...baseDeps(), signal: outerCtl.signal });
	assert.equal(r.success, true);
	assert.equal(hookCompleted, true);
	assert.deepEqual(seen, [undefined, undefined]);
});

test('hooks-context.test.ts: the hook of a nested call that has its own signal still sees none', async () => {
	registerTool(plain('hk_inner2'));
	let saw: AbortSignal | undefined = new AbortController().signal;
	registerToolHook({ id: 'h', toolId: 'hk_inner2', async run() { saw = currentToolSignal(); } });
	registerTool(plain('hk_outer2', {
		async execute(_i: unknown, d: ToolDeps) { await executeTool('hk_inner2', {}, { ...d, signal: new AbortController().signal }); return OK; },
	}));
	await executeTool('hk_outer2', {}, { ...baseDeps(), signal: new AbortController().signal });
	assert.equal(saw, undefined);
});

test('hooks-context.test.ts: hook failures are still reported on the result and never turn success into failure', async () => {
	registerTool(plain('hk_fail'));
	registerToolHook({ id: 'boom', toolId: 'hk_fail', async run() { throw new Error('nope'); } });
	const r = await executeTool('hk_fail', {}, { ...baseDeps(), signal: new AbortController().signal });
	assert.equal(r.success, true);
	assert.deepEqual(r.hookFailures, [{ hookId: 'boom', message: 'nope' }]);
});

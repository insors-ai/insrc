/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * s1 / sc1: the tool hook registry and the executor's hook stage.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HookFailure, ToolResult } from '../types.js';

test('tool-hooks.test.ts: HookFailure report shape', () => {
	const failure: HookFailure = { hookId: 'refresh', message: 'boom' };
	const result: ToolResult = { output: 'ok', format: 'text', success: true, hookFailures: [failure] };
	assert.deepEqual(Object.keys(failure).sort(), ['hookId', 'message']);
	assert.equal(result.success, true);
	assert.deepEqual(result.hookFailures, [{ hookId: 'refresh', message: 'boom' }]);
	const plain: ToolResult = { output: 'ok', format: 'text', success: true };
	assert.equal('hookFailures' in plain, false, 'absent unless a rule failed');
});

// ── registry and run point ────────────────────────────────────────────────

import { afterEach, beforeEach } from 'node:test';
import { HOOK_MESSAGE_MAX, _resetToolHooksForTests, registerToolHook, runToolHooks } from '../hooks.js';
import { _resetRegistryForTests, registerTool, registerToolAlias } from '../registry.js';
import type { Tool, ToolHook } from '../types.js';
import { deps, fakeTool } from './_fakes.js';

const ok = (data?: unknown): ToolResult => ({ output: 'ok', format: 'text', success: true, ...(data !== undefined ? { data } : {}) });
const hook = (id: string, toolId: string, run: ToolHook['run'] = async () => {}): ToolHook => ({ id, toolId, run });
const tool = (id = 'demo'): Tool => fakeTool(id, ok(), { schemas: false });

beforeEach(() => { _resetToolHooksForTests(); _resetRegistryForTests(); });
afterEach(() => { _resetToolHooksForTests(); _resetRegistryForTests(); });

test('tool-hooks.test.ts: registerToolHook appends in order and refuses a duplicate toolId+id and an empty id or toolId', async () => {
	const order: string[] = [];
	registerToolHook(hook('a', 'demo', async () => { order.push('a'); }));
	registerToolHook(hook('b', 'demo', async () => { order.push('b'); }));
	registerToolHook(hook('a', 'other'));                         // same id, different tool: allowed
	assert.throws(() => registerToolHook(hook('a', 'demo')), /already registered/);
	assert.throws(() => registerToolHook(hook('', 'demo')), /id is empty/);
	assert.throws(() => registerToolHook(hook('c', '  ')), /names no tool/);
	await runToolHooks(tool(), {}, ok(), deps());
	assert.deepEqual(order, ['a', 'b']);
});

test('tool-hooks.test.ts: registerToolHook refuses an alias in place of a canonical id', () => {
	registerTool(tool('file:read'));
	registerToolAlias('file:read', 'Read');
	assert.throws(() => registerToolHook(hook('h', 'Read')), /alias.*file:read/);
	registerToolHook(hook('h', 'file:read'));
	registerToolHook(hook('later', 'not-registered-yet'));        // a tool that registers later is fine
});

test('tool-hooks.test.ts: runToolHooks runs hooks one at a time', async () => {
	let running = 0, peak = 0;
	const slow = (id: string): ToolHook => hook(id, 'demo', async () => {
		running += 1; peak = Math.max(peak, running);
		await new Promise(r => setTimeout(r, 15));
		running -= 1;
	});
	registerToolHook(slow('a')); registerToolHook(slow('b')); registerToolHook(slow('c'));
	assert.deepEqual(await runToolHooks(tool(), {}, ok(), deps()), []);
	assert.equal(peak, 1);
});

test('tool-hooks.test.ts: runToolHooks catches a throw or rejection, cuts a long message to 500 characters and gives each hook its own structuredClone of input and result', async () => {
	const seen: unknown[] = [];
	registerToolHook(hook('throws', 'demo', async () => { throw new Error('boom'); }));
	registerToolHook(hook('rejects', 'demo', () => Promise.reject(new Error('x'.repeat(900)))));
	registerToolHook(hook('sync-throws', 'demo', (() => { throw new TypeError('sync'); }) as ToolHook['run']));
	registerToolHook(hook('sees', 'demo', async ctx => { seen.push(ctx); }));
	const input = { a: { b: 1 } }, result = ok({ n: { m: 2 } });
	const failures = await runToolHooks(tool(), input, result, { ...deps(), caller: 'workflow' });
	assert.deepEqual(failures.map(f => f.hookId), ['throws', 'rejects', 'sync-throws']);
	assert.equal(failures[0]!.message, 'boom');
	assert.equal(failures[1]!.message.length, HOOK_MESSAGE_MAX);
	assert.equal(failures[2]!.message, 'sync');
	const ctx = seen[0] as { toolId: string; input: unknown; result: ToolResult; caller: string | undefined };
	assert.equal(ctx.toolId, 'demo');
	assert.equal(ctx.caller, 'workflow');
	assert.deepEqual(ctx.input, input);
	assert.notEqual(ctx.input, input, 'a copy, not the caller\'s object');
	assert.notEqual(ctx.result, result);
	assert.notEqual((ctx.result.data as object), result.data);
});

test('tool-hooks.test.ts: failure text for a null-prototype object, a value with a throwing toString and an empty message falls back to a fixed non-empty text, and building it does not throw', async () => {
	const throwing = { toString() { throw new Error('no'); } };
	const oddError = Object.create(Error.prototype, { message: { get() { throw new Error('getter'); } } }) as unknown;
	const nullMessage = Object.assign(new Error('x'), { message: null }) as unknown;
	const values: unknown[] = [Object.create(null), throwing, new Error(''), '', '   ', undefined, oddError, nullMessage];
	for (const [i, v] of values.entries()) {
		registerToolHook(hook(`h${i}`, 'demo', async () => { throw v; }));
	}
	const failures = await runToolHooks(tool(), {}, ok(), deps());
	assert.equal(failures.length, values.length, 'every rule is reported and nothing escapes');
	assert.equal(failures[0]!.message, 'the rule failed with a value that could not be described');
	assert.equal(failures[1]!.message, 'the rule failed with a value that could not be described');
	for (const f of failures.slice(2, 5)) assert.equal(f.message, 'the rule failed with no message');
	assert.equal(failures[5]!.message, 'undefined', 'a thrown undefined is still readable');
	assert.equal(failures[6]!.message, 'the rule failed with a value that could not be described', 'an Error whose message getter throws');
	assert.equal(failures[7]!.message, 'null', 'an Error whose message is not a string is still described');
	for (const f of failures) assert.ok(f.message.length > 0);
});

test('tool-hooks.test.ts: a hook that mutates nested result.data, with and without then throwing, leaves the caller\'s result untouched; a result that cannot be cloned reports that hook as failed and still runs the rest', async () => {
	const result = ok({ total: 1, rows: [{ n: 1 }] });
	const input = { opts: { deep: true } };
	registerToolHook(hook('mutates', 'demo', async ctx => {
		(ctx.result.data as { total: number }).total = 9;
		(ctx.input as { opts: { deep: boolean } }).opts.deep = false;
	}));
	registerToolHook(hook('mutates-then-throws', 'demo', async ctx => {
		(ctx.result.data as { rows: { n: number }[] }).rows[0]!.n = 99;
		throw new Error('after mutating');
	}));
	registerToolHook(hook('sees-fresh', 'demo', async ctx => {
		assert.equal((ctx.result.data as { total: number }).total, 1, 'a later hook starts from a fresh copy');
		assert.equal((ctx.input as { opts: { deep: boolean } }).opts.deep, true);
	}));
	const failures = await runToolHooks(tool(), input, result, deps());
	assert.deepEqual(failures, [{ hookId: 'mutates-then-throws', message: 'after mutating' }]);
	assert.deepEqual(result.data, { total: 1, rows: [{ n: 1 }] });
	assert.deepEqual(input, { opts: { deep: true } });

	// a result that cannot be copied: every hook is reported as failed and none of them runs, the call still returns
	_resetToolHooksForTests();
	let ran = 0;
	registerToolHook(hook('one', 'demo', async () => { ran += 1; }));
	registerToolHook(hook('two', 'demo', async () => { ran += 1; }));
	const uncloneable = ok({ fn: () => 1 });
	const failed = await runToolHooks(tool(), {}, uncloneable, deps());
	assert.deepEqual(failed.map(f => f.message), ['the result could not be copied for the rule', 'the result could not be copied for the rule']);
	assert.equal(ran, 0);
});

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
import { _resetRegistryForTests, getTool as getToolForTest, registerTool, registerToolAlias } from '../registry.js';
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

// ── the executor's hook stage ─────────────────────────────────────────────

import { _setApprovalGateForTests, executeTool } from '../executor.js';
import { OutSchema } from './_fakes.js';

const GOOD_IN = { name: 'n', count: 1 };
const GOOD_DATA = { id: 'x', total: 1 };
const withCaller = (caller: ToolDeps['caller']): ToolDeps => ({ ...deps(), ...(caller !== undefined ? { caller } : {}) });
const counter = (id: string, toolId: string, log: string[] = []): ToolHook => hook(id, toolId, async ctx => { log.push(`${id}:${ctx.caller ?? 'unset'}`); });

import type { ToolDeps } from '../types.js';
afterEach(() => { _setApprovalGateForTests(undefined); });

test('tool-hooks.test.ts: a registered rule runs once after a successful call for each caller (agent, daemon, workflow, unset)', async () => {
	registerTool(fakeTool('demo', ok(GOOD_DATA)));
	const log: string[] = [];
	registerToolHook(counter('h', 'demo', log));
	for (const caller of ['agent', 'daemon', 'workflow', undefined] as const) {
		const r = await executeTool('demo', GOOD_IN, withCaller(caller));
		assert.equal(r.success, true);
	}
	assert.deepEqual(log, ['h:agent', 'h:daemon', 'h:workflow', 'h:unset'], 'once per call, with the caller as given');
});

test('tool-hooks.test.ts: a tool with no outputSchema still runs its rules', async () => {
	registerTool(fakeTool('plain', ok(), { schemas: false }));
	const log: string[] = [];
	registerToolHook(counter('h', 'plain', log));
	const r = await executeTool('plain', {}, deps());
	assert.equal(r.success, true);
	assert.deepEqual(log, ['h:unset']);
});

test('tool-hooks.test.ts: a tool called through an alias runs the canonical id\'s rule exactly once', async () => {
	registerTool(fakeTool('file:read', ok(), { schemas: false }));
	registerToolAlias('file:read', 'Read');
	const log: string[] = [];
	registerToolHook(counter('h', 'file:read', log));
	await executeTool('Read', {}, deps());
	assert.deepEqual(log, ['h:unset'], 'by alias');
	await executeTool('file:read', {}, deps());
	assert.deepEqual(log, ['h:unset', 'h:unset'], 'by canonical id');
});

test('tool-hooks.test.ts: a failing rule leaves the result a success and reports the failure on hookFailures and in the output text', async () => {
	const returned: ToolResult = { output: 'did it', format: 'json', success: true, data: GOOD_DATA };
	registerTool(fakeTool('demo', returned));
	registerToolHook(hook('first', 'demo', async () => { throw new Error('refresh failed'); }));
	registerToolHook(hook('second', 'demo', async () => { throw new Error('second failed'); }));
	const r = await executeTool('demo', GOOD_IN, deps());
	assert.equal(r.success, true);
	assert.equal(r.format, 'json');
	assert.deepEqual(r.data, GOOD_DATA);
	assert.deepEqual(r.hookFailures, [{ hookId: 'first', message: 'refresh failed' }, { hookId: 'second', message: 'second failed' }]);
	assert.equal(r.output, 'did it\n[hook failed] first: refresh failed\n[hook failed] second: second failed');
	assert.equal(returned.output, 'did it', 'the tool\'s own result object is not edited');
	assert.equal(r.error, undefined);
	assert.equal(r.failure, undefined);
});

test('tool-hooks.test.ts: a failed, denied, rejected or schema-mismatch call runs no rule', async () => {
	const log: string[] = [];
	registerTool(fakeTool('fails', { output: 'nope', format: 'text', success: false, error: 'nope' }, { schemas: false }));
	registerTool(fakeTool('bad-data', ok({ id: 1 })));                                // data does not fit OutSchema
	registerTool(fakeTool('no-data', ok()));                                           // schema declared, no data
	registerTool(fakeTool('typed', ok(GOOD_DATA)));                                    // input is checked
	registerTool({ ...fakeTool('destructive', ok(), { schemas: false }), approval: 'destructive' });
	registerTool(fakeTool('throws', ok(), { schemas: false }));
	(getToolForTest('throws') as { execute: Tool['execute'] }).execute = async () => { throw new Error('exploded'); };
	for (const id of ['fails', 'bad-data', 'no-data', 'typed', 'destructive', 'throws']) registerToolHook(counter(`h-${id}`, id, log));
	_setApprovalGateForTests(() => ({ async ask() { return 'declined'; } }));

	const results = [
		await executeTool('fails', {}, deps()),
		await executeTool('bad-data', GOOD_IN, deps()),
		await executeTool('no-data', GOOD_IN, deps()),
		await executeTool('typed', { name: 5 }, deps()),                                   // rejected by the input check
		await executeTool('destructive', {}, deps()),                                      // denied
		await executeTool('throws', {}, deps()),
		await executeTool('missing-tool', {}, deps()),
	];
	assert.deepEqual(log, [], 'no rule ran');
	assert.deepEqual(results.map(r => r.success), [false, false, false, false, false, false, false]);
	assert.deepEqual(results.map(r => r.failure?.kind), [undefined, 'schema-mismatch', 'schema-mismatch', 'rejected', 'denied', 'rejected', 'rejected']);
	for (const r of results) assert.equal('hookFailures' in r, false);
	void OutSchema;
});

test('tool-hooks.test.ts: rules run in registration order and a failing rule does not stop the next', async () => {
	registerTool(fakeTool('demo', ok(GOOD_DATA)));
	const order: string[] = [];
	registerToolHook(hook('a', 'demo', async () => { order.push('a'); throw new Error('a failed'); }));
	registerToolHook(hook('b', 'demo', async () => { order.push('b'); }));
	registerToolHook(hook('c', 'demo', async () => { order.push('c'); }));
	const r = await executeTool('demo', GOOD_IN, deps());
	assert.deepEqual(order, ['a', 'b', 'c']);
	assert.deepEqual(r.hookFailures?.map(f => f.hookId), ['a']);
	assert.equal(r.success, true);
});

test('tool-hooks.test.ts: a call with no rule returns the object the tool returned', async () => {
	const returned = ok(GOOD_DATA);
	registerTool(fakeTool('demo', returned));
	registerTool(fakeTool('other', ok(GOOD_DATA)));
	registerToolHook(counter('h', 'other'));                                          // a rule for another tool
	const r = await executeTool('demo', GOOD_IN, deps());
	assert.equal(r, returned, 'the same object, nothing added');
	assert.equal('hookFailures' in r, false);
	// and when every rule passes
	registerToolHook(counter('h2', 'demo'));
	const again = await executeTool('demo', GOOD_IN, deps());
	assert.equal(again, returned);
});

// ── callTool carries the report ───────────────────────────────────────────

import { Type } from '@sinclair/typebox';
import { callTool } from '../call-tool.js';

function typedTool(id: string) {
	return {
		id, description: 'fake',
		inputSchema: Type.Object({ name: Type.String() }),
		outputSchema: Type.Object({ count: Type.Number() }),
		async execute(): Promise<ToolResult> { return { output: 'text', format: 'text', success: true, data: { count: 3 } }; },
	};
}

test('tool-hooks.test.ts: callTool carries hookFailures onto the typed success result', async () => {
	const t = typedTool('ct_hook_fail');
	registerTool(t);
	registerToolHook(hook('refresh', 'ct_hook_fail', async () => { throw new Error('status refresh failed'); }));
	const r = await callTool(t, { name: 'a' }, deps());
	assert.equal(r.success, true);
	if (!r.success) return;
	assert.equal(r.data.count, 3);
	assert.deepEqual(r.hookFailures, [{ hookId: 'refresh', message: 'status refresh failed' }]);
	assert.match(r.output, /\[hook failed\] refresh: status refresh failed/);
});

test('tool-hooks.test.ts: callTool omits hookFailures when nothing failed', async () => {
	const t = typedTool('ct_hook_ok');
	registerTool(t);
	const none = await callTool(t, { name: 'a' }, deps());
	assert.equal(none.success, true);
	assert.equal('hookFailures' in none, false, 'no rule registered');
	registerToolHook(hook('passes', 'ct_hook_ok'));
	const passing = await callTool(t, { name: 'a' }, deps());
	assert.equal('hookFailures' in passing, false, 'a rule ran and passed');
	assert.equal(passing.output, 'text');
});

// ── through the executor: failure text and nested mutation ────────────────

test('tool-hooks.test.ts: a rule that throws a null-prototype object or a value with a throwing toString is reported with a fixed text', async () => {
	registerTool(fakeTool('demo', ok(GOOD_DATA)));
	registerToolHook(hook('nullproto', 'demo', async () => { throw Object.create(null); }));
	registerToolHook(hook('badstring', 'demo', async () => { throw { toString() { throw new Error('no'); } }; }));
	registerToolHook(hook('after', 'demo'));
	const r = await executeTool('demo', GOOD_IN, deps());
	assert.equal(r.success, true, 'the call is still a success');
	assert.deepEqual(r.hookFailures, [
		{ hookId: 'nullproto', message: 'the rule failed with a value that could not be described' },
		{ hookId: 'badstring', message: 'the rule failed with a value that could not be described' },
	]);
	assert.match(r.output, /\[hook failed\] nullproto: the rule failed with a value that could not be described/);
});

test('tool-hooks.test.ts: a rule that mutates nested result data leaves the caller\'s result untouched', async () => {
	const data = { id: 'x', total: 1 };
	const returned: ToolResult = { output: 'ok', format: 'text', success: true, data };
	registerTool(fakeTool('demo', returned));
	registerToolHook(hook('mutates', 'demo', async ctx => { (ctx.result.data as { total: number }).total = 9; (ctx.input as { count: number }).count = 99; }));
	registerToolHook(hook('mutates-then-throws', 'demo', async ctx => { (ctx.result.data as { id: string }).id = 'changed'; throw new Error('late'); }));
	const input = { name: 'n', count: 1 };
	const r = await executeTool('demo', input, deps());
	assert.deepEqual(r.data, { id: 'x', total: 1 });
	assert.equal(r.data, data, 'the caller receives the tool\'s own data object');
	assert.deepEqual(input, { name: 'n', count: 1 });
	assert.deepEqual(r.hookFailures, [{ hookId: 'mutates-then-throws', message: 'late' }]);
});

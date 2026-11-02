/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s8/t1: the git op table, which builds a family tool from a list of ops and extends one of
 * the existing multi-operation tools.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/op-table.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Type } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { Ajv } from 'ajv';

import { cleanup } from '../../../__tests__/_proc.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import { _resetRegistryForTests, registerTool } from '../../../registry.js';
import type { ApprovalGate, ToolInput } from '../../../types.js';
import { field } from '../../gh/op-table.js';
import { SAFE_REF } from '../safe-args.js';
import { buildGitFamilyTool, extendGitTool, MAX_STDIN_BYTES } from '../op-table.js';
import type { GitOpSpec } from '../op-table.js';
import { gitStashTool } from '../stash.js';
import { toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
afterEach(() => {
	_setApprovalGateForTests(undefined);
	_resetRegistryForTests();
	standIn?.restore();
	if (standIn) { cleanup(standIn.dir); }
	standIn = undefined;
});

const read: GitOpSpec = { name: 'read', cls: 'none', timeoutMs: 5000, argv: () => ['describe-it'] };
const wipe: GitOpSpec = {
	name: 'wipe', cls: 'destructive', timeoutMs: 5000, fields: { target: field.str() }, required: ['target'], refs: ['target'],
	argv: i => ['wipe-it', String(i['target'])], notice: 'Discards the target.',
};
const feed: GitOpSpec = {
	name: 'feed', cls: 'common', timeoutMs: 5000, fields: { content: field.str('Text to send.', true) }, required: ['content'], stdin: 'content',
	argv: () => ['feed-it'],
};
const build = (...ops: GitOpSpec[]) => buildGitFamilyTool({ id: 'git_probe', description: 'probe', ops });

const asking = (answer: 'approve' | 'deny'): { gate: ApprovalGate; asked: () => number } => {
	let n = 0;
	return {
		asked: () => n,
		gate: { async ask(r) { n += 1; return answer === 'approve' ? { requestId: r.requestId, decision: 'approve' } : 'no-client'; } },
	};
};

test('op-table.test.ts: buildGitFamilyTool makes a flat input schema with an op enum and an output union carrying the literal op', () => {
	const tool = build(read, wipe, feed);
	const input = tool.inputSchema as { properties: Record<string, { enum?: string[] }>; additionalProperties?: boolean; required?: string[] };
	assert.deepEqual(input.properties['op']?.enum, ['read', 'wipe', 'feed']);
	assert.equal(input.additionalProperties, false);
	assert.deepEqual(Object.keys(input.properties).sort(), ['content', 'cwd', 'op', 'target']);
	assert.deepEqual(input.required, ['op'], 'a field only some ops need is optional in the flat schema');
	const members = (tool.outputSchema as { anyOf: Array<{ properties: { op: { const: string } } }> }).anyOf;
	assert.deepEqual(members.map(m => m.properties.op.const), ['read', 'wipe', 'feed']);
	assert.equal(Value.Check(tool.outputSchema, { op: 'read', text: 'x' }), true);
	assert.equal(Value.Check(tool.outputSchema, { op: 'nope', text: 'x' }), false);
});

test('op-table.test.ts: buildGitFamilyTool throws at build time for a duplicate op, an op without a class, a stdin op without a stdin field and disagreeing shared fields', () => {
	assert.throws(() => build(read, { ...read }), /two ops are named read/);
	assert.throws(() => build({ ...read, cls: undefined } as unknown as GitOpSpec), /no approval class/);
	assert.throws(() => build({ ...feed, stdin: 'missing' }), /no string field missing/);
	assert.throws(() => build({ ...feed, stdin: undefined, fields: undefined, refs: ['ghost'] }), /does not declare it/);
	assert.throws(() => build({ ...wipe, fields: { target: field.str() } }, { ...feed, fields: { content: field.str('x', true), target: field.int() }, argv: () => [] }), /declared differently/);
});

test('op-table.test.ts: a field the op does not take and a value outside its pattern are refused before any approval request', async () => {
	standIn = installStandInGit('exit 0');
	const strict: GitOpSpec = { ...wipe, fields: { target: { ...field.str(), pattern: SAFE_REF } } };
	registerTool(build(read, strict));
	const { gate, asked } = asking('approve');
	_setApprovalGateForTests(() => gate);
	const run = (input: ToolInput) => executeTool('git_probe', { cwd: '/tmp', ...input }, toolDeps('/tmp'));

	const outside = await run({ op: 'wipe', target: '-rf' });
	assert.equal(outside.success, false);
	assert.equal(outside.failure?.kind, 'rejected', 'a value outside its pattern is refused by the schema');
	const stray = await run({ op: 'read', target: 'main' });
	assert.equal(stray.success, false);
	assert.match(stray.error ?? '', /does not accept the field target/);
	assert.equal(asked(), 0, 'no approval request was built for either');
	assert.deepEqual(standIn.calls(), [], 'git did not start');
});

test('op-table.test.ts: a cut stdout is a rejected failure and a result outside the answer member is a schema-mismatch failure', async () => {
	standIn = installStandInGit('printf "0123456789"; exit 0');
	registerTool(build(
		{ ...read, name: 'cut', maxBytes: 4 },
		{ ...read, name: 'shape', answer: { count: Type.Number() }, parse: r => ({ count: r.stdout }) },
		{ ...read, name: 'fine' },
	));
	const run = (op: string) => executeTool('git_probe', { cwd: '/tmp', op }, toolDeps('/tmp'));

	const cut = await run('cut');
	assert.equal(cut.success, false);
	assert.equal(cut.failure?.kind, 'rejected');
	assert.match(cut.failure?.message ?? '', /output cut at 4 bytes/);
	assert.doesNotMatch(JSON.stringify(cut.data ?? {}), /0123/, 'the partial text is not returned as an answer');

	const shape = await run('shape');
	assert.equal(shape.success, false);
	assert.equal(shape.failure?.kind, 'schema-mismatch');
	assert.equal(shape.failure?.original, '0123456789', 'the original text is kept');

	const fine = await run('fine');
	assert.equal(fine.success, true);
	assert.deepEqual(fine.data, { op: 'fine', text: '0123456789' });
});

test('op-table.test.ts: a stdin delivery error is a failure with no answer', async () => {
	// git exits at once without reading its input; a large input makes the write fail with EPIPE
	standIn = installStandInGit('exit 0');
	registerTool(build(feed));
	const { gate } = asking('approve');
	_setApprovalGateForTests(() => gate);
	const r = await executeTool('git_probe', { cwd: '/tmp', op: 'feed', content: 'x'.repeat(MAX_STDIN_BYTES) }, toolDeps('/tmp'));
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'rejected');
	assert.match(r.failure?.message ?? '', /could not deliver content to git/);
	assert.equal(r.data, undefined, 'no answer was parsed');

	const tooBig = await executeTool('git_probe', { cwd: '/tmp', op: 'feed', content: 'x'.repeat(MAX_STDIN_BYTES + 1) }, toolDeps('/tmp'));
	assert.equal(tooBig.success, false);
	assert.match(tooBig.error ?? '', /larger than the/);
});

test('op-table.test.ts: extendGitTool keeps existing inputs and classes and throws for a collision', async () => {
	standIn = installStandInGit('echo "$*" >/dev/null; exit 0');
	const extended = extendGitTool(gitStashTool, [{ ...wipe, name: 'purge', fields: { target: field.str() } }]);
	const props = (extended.inputSchema as { properties: Record<string, { enum?: string[] }> }).properties;
	assert.ok(props['op']?.enum?.includes('purge') && props['op'].enum.includes('push'));
	assert.equal(extended.id, 'git_stash');

	const approval = (input: ToolInput): unknown => (typeof extended.approval === 'function' ? extended.approval(input) : extended.approval);
	const baseApproval = (input: ToolInput): unknown => (typeof gitStashTool.approval === 'function' ? gitStashTool.approval(input) : gitStashTool.approval);
	for (const input of [{}, { op: 'list' }, { op: 'push' }, { op: 'drop' }, { op: 'clear' }, { op: 'show' }] as ToolInput[]) {
		assert.equal(approval(input), baseApproval(input), `class of ${JSON.stringify(input)} is the base's`);
	}
	assert.equal(approval({ op: 'purge', target: 'x' }), 'destructive');
	const validate = new Ajv({ strict: false }).compile(extended.inputSchema);
	for (const old of [{ op: 'push', message: 'm' }, { ref: 'stash@{1}' }, { op: 'list' }]) {
		assert.equal(validate(old), true, `${JSON.stringify(old)} is still valid`);
	}
	const stray = await extended.execute({ op: 'list', target: 'x' }, toolDeps('/tmp'));
	assert.equal(stray.success, false, 'a base op is refused a field only the new ops define');

	assert.throws(() => extendGitTool(gitStashTool, [{ ...read, name: 'push' }]), /already exists/);
	assert.throws(() => extendGitTool(gitStashTool, [{ ...wipe, name: 'purge', fields: { message: field.int() }, refs: [], required: [] }]), /collides/);
});

test('op-table.test.ts: a missing git is missing-tool, a killed command is timed-out with the unknown-outcome text when the op changes something, and a class that is a function is evaluated per input', async () => {
	const slowRead: GitOpSpec = { name: 'slow-read', cls: 'none', timeoutMs: 300, argv: () => ['wait-a-while'] };
	const slowWrite: GitOpSpec = { name: 'slow-write', cls: 'common', timeoutMs: 300, argv: () => ['wait-a-while'] };
	const either: GitOpSpec = { name: 'either', cls: i => (i['dangerous'] === true ? 'destructive' : 'none'), fields: { dangerous: field.bool('Whether it is dangerous.') }, timeoutMs: 5000, argv: () => ['either'] };
	const tool = build(slowRead, slowWrite, either);
	const approval = tool.approval as (input: ToolInput) => string;
	assert.equal(approval({ op: 'either', dangerous: true }), 'destructive');
	assert.equal(approval({ op: 'either' }), 'none');
	assert.equal(approval({ op: 'slow-write' }), 'common');
	registerTool(tool);
	_setApprovalGateForTests(() => ({ async ask(r) { return { requestId: r.requestId, decision: 'approve' as const }; } }));
	const run = (op: string) => executeTool('git_probe', { cwd: '/tmp', op }, toolDeps('/tmp'));

	standIn = installStandInGit('sleep 5');
	const read = await run('slow-read');
	assert.equal(read.failure?.kind, 'timed-out');
	assert.doesNotMatch(read.failure?.message ?? '', /outcome is unknown/, 'a read does not claim an unknown outcome');
	const write = await run('slow-write');
	assert.equal(write.failure?.kind, 'timed-out');
	assert.match(write.failure?.message ?? '', /outcome is unknown/, 'a changing op says so');

	const path = process.env['PATH'];
	process.env['PATH'] = '/nonexistent-insrc-path';
	try {
		const gone = await run('slow-read');
		assert.equal(gone.success, false);
		assert.equal(gone.failure?.kind, 'missing-tool');
	} finally { process.env['PATH'] = path; }
});

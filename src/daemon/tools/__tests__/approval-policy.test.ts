/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s3/t5: the pure approval policy.
 * Run: npx tsx --test src/daemon/tools/__tests__/approval-policy.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { APPROVAL_WAIT_MS } from '../../approval-broker.js';
import { ARGUMENT_DISPLAY_MAX, buildApprovalRequest, resolveApprovalClass, shouldAsk } from '../approval-policy.js';
import type { CommonApprovalMode, ToolInput } from '../types.js';

const MODES: Array<CommonApprovalMode | undefined> = [undefined, 'manual', 'edit-auto', 'auto'];
const FLAGS: CommonApprovalMode[] = ['manual', 'edit-auto', 'auto'];

test('approval-policy.test.ts: class resolution gives none, common, destructive, a per-input class, and destructive for a throwing function', () => {
	assert.equal(resolveApprovalClass({}, {}), 'none');
	assert.equal(resolveApprovalClass({ approval: 'none' }, {}), 'none');
	assert.equal(resolveApprovalClass({ approval: 'common' }, {}), 'common');
	assert.equal(resolveApprovalClass({ approval: 'destructive' }, {}), 'destructive');
	const perInput = { approval: (i: ToolInput) => (i['force'] === true ? 'destructive' as const : 'none' as const) };
	assert.equal(resolveApprovalClass(perInput, { force: true }), 'destructive');
	assert.equal(resolveApprovalClass(perInput, { force: false }), 'none');
	assert.equal(resolveApprovalClass({ approval: () => { throw new Error('boom'); } }, {}), 'destructive');
});

test('approval-policy.test.ts: a destructive tool asks under every approvalMode, every flag value, any caller and any argument', () => {
	for (const mode of MODES) for (const flag of FLAGS) {
		assert.equal(shouldAsk('destructive', { approvalMode: mode }, flag), true, `mode=${mode} flag=${flag}`);
	}
	// none never asks
	for (const mode of MODES) for (const flag of FLAGS) assert.equal(shouldAsk('none', { approvalMode: mode }, flag), false);
	// the caller and the arguments are not inputs to the decision at all: the function takes only class, mode and flag
	assert.equal(shouldAsk.length, 3);
});

test('approval-policy.test.ts: a common tool asks in manual and edit-auto, not in auto, and the call mode wins over the flag', () => {
	for (const flag of FLAGS) assert.equal(shouldAsk('common', {}, flag), flag !== 'auto', `flag only: ${flag}`);
	// the call's mode overrides the flag in both directions
	for (const flag of FLAGS) {
		assert.equal(shouldAsk('common', { approvalMode: 'auto' }, flag), false);
		assert.equal(shouldAsk('common', { approvalMode: 'manual' }, flag), true);
		assert.equal(shouldAsk('common', { approvalMode: 'edit-auto' }, flag), true);
	}
});

test('approval-policy.test.ts: the request takes the repository from input cwd then deps.repoPath, truncates large arguments and falls back to a generic preview', async () => {
	const big = 'x'.repeat(ARGUMENT_DISPLAY_MAX + 500);
	const tool = { id: 'git_push' };
	const fromCwd = await buildApprovalRequest({ tool, cls: 'destructive', input: { cwd: '/work/a', body: big, nested: { list: [big] } }, deps: { repoPath: '/fallback' }, now: 1_000 });
	assert.equal(fromCwd.repoPath, '/work/a');
	assert.equal(fromCwd.toolId, 'git_push');
	assert.equal(fromCwd.approvalClass, 'destructive');
	const body = fromCwd.arguments['body'] as string;
	assert.ok(body.length < big.length && body.endsWith(`[${big.length} characters in total]`), 'the length is noted');
	assert.ok(((fromCwd.arguments['nested'] as { list: string[] }).list[0]!).endsWith('characters in total]'), 'nested strings too');
	assert.equal(fromCwd.expiresAt, new Date(1_000 + APPROVAL_WAIT_MS).toISOString());
	assert.equal(fromCwd.preview?.title, 'git_push', 'no buildApprovalGate: generic preview');

	const fallback = await buildApprovalRequest({ tool, cls: 'common', input: { cwd: '' }, deps: { repoPath: '/fallback' } });
	assert.equal(fallback.repoPath, '/fallback');
	assert.notEqual(fallback.requestId, (await buildApprovalRequest({ tool, cls: 'common', input: {}, deps: { repoPath: '/fallback' } })).requestId, 'every request has its own id');

	const tailored = await buildApprovalRequest({ tool: { id: 'k8s', buildApprovalGate: () => ({ title: 'Delete pod', content: 'pod/web-1', actions: [] }) }, cls: 'destructive', input: {}, deps: { repoPath: '/r' } });
	assert.deepEqual(tailored.preview, { title: 'Delete pod', content: 'pod/web-1' });
	const broken = await buildApprovalRequest({ tool: { id: 'k8s', buildApprovalGate: () => { throw new Error('no preview'); } }, cls: 'destructive', input: { a: 1 }, deps: { repoPath: '/r' } });
	assert.equal(broken.preview?.title, 'k8s');
	assert.match(broken.preview!.content, /"a": 1/);
});

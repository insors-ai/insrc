/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t7: git_update_ref deletes a ref and always asks.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-update-ref.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { cleanup } from '../../../__tests__/_proc.js';
import { resolveApprovalClass } from '../../../approval-policy.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import { setShellTimeoutScaleForTests } from '../../../shell-helper.js';
import { getTool } from '../../../registry.js';
import type { ApprovalGate, ApprovalRequest } from '../../../types.js';
import { git, newRepo, registerForTests, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
afterEach(() => { setShellTimeoutScaleForTests(undefined); _setApprovalGateForTests(undefined); standIn?.restore(); if (standIn) cleanup(standIn.dir); standIn = undefined; });

function approver(): { requests: ApprovalRequest[] } {
	const requests: ApprovalRequest[] = [];
	const gate: ApprovalGate = { async ask(r) { requests.push(r); return { requestId: r.requestId, decision: 'approve' }; } };
	_setApprovalGateForTests(() => gate);
	return { requests };
}
function repoWithRef(ref: string): string {
	const repo = newRepo();
	git(repo, 'commit', '-q', '--allow-empty', '-m', 'one');
	git(repo, 'update-ref', ref, 'HEAD');
	return repo;
}

test('git-update-ref.test.ts: deletes a ref with argv git update-ref -d ref, returns {ref, deleted:true}, and an absent ref is a success', async () => {
	registerForTests(); approver();
	const repo = repoWithRef('refs/heads/tmp1');
	try {
		const r = await executeTool('git_update_ref', { cwd: repo, ref: 'refs/heads/tmp1', delete: true }, toolDeps(repo));
		assert.equal(r.success, true, r.output);
		assert.deepEqual(r.data, { ref: 'refs/heads/tmp1', deleted: true });
		assert.equal(git(repo, 'for-each-ref', 'refs/heads/tmp1').trim(), '');
		const again = await executeTool('git_update_ref', { cwd: repo, ref: 'refs/heads/tmp1', delete: true }, toolDeps(repo));
		assert.equal(again.success, true, 'an already-absent ref is a success');
	} finally { rmSync(repo, { recursive: true, force: true }); }
	standIn = installStandInGit('exit 0');
	await executeTool('git_update_ref', { cwd: '/tmp', ref: 'refs/tags/x', delete: true }, toolDeps('/tmp'));
	assert.deepEqual(standIn.calls(), ['update-ref -d refs/tags/x']);
});

test('git-update-ref.test.ts: delete false, a missing delete, a ref outside refs/, and a ref isSafeRefName refuses are rejected by the schema', async () => {
	registerForTests(); const { requests } = approver();
	standIn = installStandInGit('exit 0');
	const bad: Array<Record<string, unknown>> = [
		{ ref: 'refs/heads/x', delete: false }, { ref: 'refs/heads/x' }, { ref: 'heads/x', delete: true }, { ref: 'x', delete: true },
		{ ref: 'refs/heads/a..b', delete: true }, { ref: 'refs/heads/a b', delete: true }, { ref: 'refs/heads/x.lock', delete: true }, { ref: 'refs/heads/x/', delete: true },
		{ ref: '-refs/heads/x', delete: true }, { ref: 'refs/heads/a~1', delete: true }, { ref: 'refs/heads/x\u0000', delete: true },
	];
	for (const input of bad) {
		const r = await executeTool('git_update_ref', { cwd: '/tmp', ...input }, toolDeps('/tmp'));
		assert.equal(r.failure?.kind, 'rejected', JSON.stringify(input));
	}
	assert.equal(requests.length, 0); assert.deepEqual(standIn.calls(), []);
});

test('git-update-ref.test.ts: a ref with a non-ASCII letter, + or # is accepted', async () => {
	registerForTests(); approver();
	standIn = installStandInGit('exit 0');
	for (const ref of ['refs/heads/fü', 'refs/heads/a+b', 'refs/heads/a#b', 'refs/heads/日本']) {
		const r = await executeTool('git_update_ref', { cwd: '/tmp', ref, delete: true }, toolDeps('/tmp'));
		assert.equal(r.success, true, ref);
	}
});

test('git-update-ref.test.ts: the class is destructive and valid input always asks; a timed-out call says the outcome is unknown', async () => {
	registerForTests(); const { requests } = approver();
	assert.equal(resolveApprovalClass(getTool('git_update_ref')!, { ref: 'refs/heads/x', delete: true }), 'destructive');
	standIn = installStandInGit('sleep 30');
	setShellTimeoutScaleForTests(0.02);
	const r = await executeTool('git_update_ref', { cwd: '/tmp', ref: 'refs/heads/x', delete: true }, { ...toolDeps('/tmp'), approvalMode: 'auto' });
	assert.equal(requests.length, 1, 'it asked even in auto mode');
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'timed-out');
	assert.match(r.failure?.message ?? '', /outcome is unknown/);
});

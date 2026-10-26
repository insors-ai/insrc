/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t7: git_rm removes paths and always asks.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-rm.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup } from '../../../__tests__/_proc.js';
import { resolveApprovalClass } from '../../../approval-policy.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import { setShellTimeoutScaleForTests } from '../../../shell-helper.js';
import { getTool } from '../../../registry.js';
import type { ApprovalGate, ApprovalRequest } from '../../../types.js';
import { git, newRepo, registerForTests, richRepo, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
afterEach(() => { _setApprovalGateForTests(undefined); standIn?.restore(); if (standIn) cleanup(standIn.dir); standIn = undefined; });

function approver(): { requests: ApprovalRequest[] } {
	const requests: ApprovalRequest[] = [];
	const gate: ApprovalGate = { async ask(r) { requests.push(r); return { requestId: r.requestId, decision: 'approve' }; } };
	_setApprovalGateForTests(() => gate);
	return { requests };
}

test('git-rm.test.ts: the argv is git rm -q --ignore-unmatch -- paths, quiet false drops -q, and the output is the paths', async () => {
	registerForTests(); approver();
	standIn = installStandInGit('exit 0');
	const a = await executeTool('git_rm', { cwd: '/tmp', paths: ['a.txt', 'b.txt'] }, toolDeps('/tmp'));
	await executeTool('git_rm', { cwd: '/tmp', paths: ['c'], quiet: false }, toolDeps('/tmp'));
	assert.deepEqual(standIn.calls(), ['rm -q --ignore-unmatch -- a.txt b.txt', 'rm --ignore-unmatch -- c']);
	assert.deepEqual(a.data, { paths: ['a.txt', 'b.txt'] });
});

test('git-rm.test.ts: a tracked path is removed, an untracked path succeeds, and a path starting with - is accepted', async () => {
	registerForTests(); approver();
	const repo = newRepo();
	try {
		writeFileSync(join(repo, 'a.txt'), 'x\n'); git(repo, 'add', '-A'); git(repo, 'commit', '-q', '-m', 'one');
		const r = await executeTool('git_rm', { cwd: repo, paths: ['a.txt'] }, toolDeps(repo));
		assert.equal(r.success, true, r.output);
		assert.equal(existsSync(join(repo, 'a.txt')), false);
		const untracked = await executeTool('git_rm', { cwd: repo, paths: ['never-tracked.txt'] }, toolDeps(repo));
		assert.equal(untracked.success, true, 'an untracked path matches nothing and succeeds');
		const dash = await executeTool('git_rm', { cwd: repo, paths: ['-weird'] }, toolDeps(repo));
		assert.equal(dash.success, true, 'a leading - follows -- so it is a path');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('git-rm.test.ts: empty paths, 201 paths and a path with a NUL are rejected by the schema', async () => {
	registerForTests(); const { requests } = approver();
	standIn = installStandInGit('exit 0');
	const many = Array.from({ length: 201 }, (_, i) => `f${i}`);
	for (const paths of [[], many, ['a\u0000b']]) {
		const r = await executeTool('git_rm', { cwd: '/tmp', paths }, toolDeps('/tmp'));
		assert.equal(r.failure?.kind, 'rejected', JSON.stringify(paths).slice(0, 30));
	}
	assert.equal(requests.length, 0); assert.deepEqual(standIn.calls(), []);
});

test('git-rm.test.ts: the class is destructive, valid input always asks, and it runs in a worktree directory given as cwd', async () => {
	registerForTests(); const { requests } = approver();
	assert.equal(resolveApprovalClass(getTool('git_rm')!, { paths: ['x'] }), 'destructive');
	const { repo, wt, remote } = richRepo();
	try {
		const r = await executeTool('git_rm', { cwd: wt, paths: ['a.txt'] }, { ...toolDeps(repo), approvalMode: 'auto' });
		assert.equal(r.success, true, r.output);
		assert.equal(requests.length, 1, 'it asked even in auto mode');
		assert.equal(existsSync(join(wt, 'a.txt')), false, 'removed in the worktree');
		assert.equal(existsSync(join(repo, 'a.txt')), true, 'not in the main work tree');
	} finally { for (const d of [repo, wt, remote]) rmSync(d, { recursive: true, force: true }); }
});

/** The tool's own limit, as a ceiling: with every limit scaled down a sleeping git is stopped after about limit x scale. */
async function assertCeiling(run: () => Promise<{ success: boolean; failure?: { kind?: string } | undefined }>, limitMs: number): Promise<void> {
	const scale = 0.05;
	standIn = installStandInGit('sleep 30');
	setShellTimeoutScaleForTests(scale);
	const t0 = Date.now();
	const r = await run();
	const took = Date.now() - t0;
	setShellTimeoutScaleForTests(undefined);
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'timed-out');
	assert.ok(took >= limitMs * scale * 0.8 && took < limitMs * scale * 2 + 800, `stopped after ${took} ms, expected about ${limitMs * scale} ms`);
}

test('git-rm.test.ts: the 30000 ms ceiling stops a sleeping git with a timed-out failure that says the outcome is unknown', async () => {
	registerForTests(); approver();
	await assertCeiling(() => executeTool('git_rm', { cwd: '/tmp', paths: ['a'] }, toolDeps('/tmp')), 30_000);
});

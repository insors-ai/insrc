/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s8/t6: the destructive inputs of git_tree are denied with no client before git starts and
 * their safe counterparts are common; a command the installed git lacks fails with git's message and the version the
 * table was written for.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-tree.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup } from '../../../__tests__/_proc.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import type { ApprovalDenial, ApprovalGate, ToolInput } from '../../../types.js';
import { gitTreeTool } from '../tree.js';
import { registerForTests, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
afterEach(() => { _setApprovalGateForTests(undefined); standIn?.restore(); if (standIn) { cleanup(standIn.dir); } standIn = undefined; });

const classOf = (input: ToolInput): string => (gitTreeTool.approval as (i: ToolInput) => string)(input);

const DESTRUCTIVE: ToolInput[] = [
	{ op: 'clean' }, { op: 'clean', directories: true, ignored: true },
	{ op: 'restore', paths: ['a.txt'] }, { op: 'restore', paths: ['a.txt'], worktree: true, staged: true },
	{ op: 'checkout-index', all: true, force: true }, { op: 'mv', from: 'a', to: 'b', force: true },
	{ op: 'submodule', action: 'deinit', paths: ['sm'] }, { op: 'submodule', action: 'update', force: true },
	{ op: 'merge-file', current: 'a', base: 'b', other: 'c' }, { op: 'replay', onto: 'main', range: 'main..topic', refAction: 'update' },
];
const SAFE: Array<[ToolInput, string]> = [
	[{ op: 'clean', dryRun: true }, 'none'], [{ op: 'restore', paths: ['a.txt'], staged: true }, 'common'],
	[{ op: 'checkout-index', all: true }, 'common'], [{ op: 'mv', from: 'a', to: 'b' }, 'common'],
	[{ op: 'submodule', action: 'update' }, 'common'], [{ op: 'submodule', action: 'status' }, 'none'],
	[{ op: 'merge-file', current: 'a', base: 'b', other: 'c', stdout: true }, 'none'], [{ op: 'replay', onto: 'main', range: 'main..topic' }, 'none'],
	[{ op: 'sparse-checkout', action: 'list' }, 'none'], [{ op: 'sparse-checkout', action: 'disable' }, 'common'],
	[{ op: 'rerere', action: 'status' }, 'none'], [{ op: 'rerere', action: 'clear' }, 'common'],
	[{ op: 'bisect', action: 'log' }, 'none'], [{ op: 'bisect', action: 'start' }, 'common'],
];

test('git-tree.test.ts: destructive inputs are denied with no client before git starts and safe inputs are common', async () => {
	for (const input of DESTRUCTIVE) { assert.equal(classOf(input), 'destructive', JSON.stringify(input)); }
	for (const [input, cls] of SAFE) { assert.equal(classOf(input), cls, JSON.stringify(input)); }

	registerForTests();
	standIn = installStandInGit('exit 0');
	let asked = 0;
	const gate: ApprovalGate = { async ask() { asked += 1; return 'no-client' as ApprovalDenial; } };
	_setApprovalGateForTests(() => gate);
	for (const input of DESTRUCTIVE) {
		const r = await executeTool('git_tree', { cwd: '/tmp', ...input }, toolDeps('/tmp'));
		assert.equal(r.success, false, JSON.stringify(input));
	}
	assert.equal(asked, DESTRUCTIVE.length, 'every destructive call asked');
	assert.deepEqual(standIn.calls(), [], 'git did not start for any of them');
});

test('git-tree.test.ts: submodule add refuses an ext:: url and every submodule action switches the ext transport off', async () => {
	registerForTests();
	standIn = installStandInGit('exit 0');
	_setApprovalGateForTests(() => ({ async ask(r) { return { requestId: r.requestId, decision: 'approve' as const }; } }));
	for (const url of ['ext::sh -c "touch /tmp/insrc-ext-ran"', '--upload-pack=x']) {
		const r = await executeTool('git_tree', { cwd: '/tmp', op: 'submodule', action: 'add', url, paths: ['sm'] }, toolDeps('/tmp'));
		assert.equal(r.success, false, url);
	}
	assert.deepEqual(standIn.calls(), [], 'git did not start');
	await executeTool('git_tree', { cwd: '/tmp', op: 'submodule', action: 'status' }, toolDeps('/tmp'));
	assert.deepEqual(standIn.calls(), ['-c protocol.ext.allow=never submodule status']);
});

test('git-tree.test.ts: a command the installed git lacks fails with git\'s message and the recorded version', async () => {
	registerForTests();
	standIn = installStandInGit(`echo "git: 'replay' is not a git command. See 'git --help'." >&2; exit 1`);
	const r = await executeTool('git_tree', { cwd: '/tmp', op: 'replay', onto: 'main', range: 'main..topic' }, toolDeps('/tmp'));
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'rejected');
	assert.match(r.failure?.message ?? '', /'replay' is not a git command/);
	assert.match(r.failure?.message ?? '', /written for git 2\.53\.0/);
});

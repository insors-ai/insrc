/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s8/t4: the destructive inputs of git_objects are denied with no client before git starts and
 * their safe counterparts are common; a failed stdin delivery reports nothing as applied.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-objects.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup } from '../../../__tests__/_proc.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import type { ApprovalDenial, ApprovalGate, ToolInput } from '../../../types.js';
import { MAX_STDIN_BYTES } from '../op-table.js';
import { gitObjectsTool } from '../objects.js';
import { registerForTests, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
afterEach(() => { _setApprovalGateForTests(undefined); standIn?.restore(); if (standIn) { cleanup(standIn.dir); } standIn = undefined; });

const classOf = (input: ToolInput): string => (gitObjectsTool.approval as (i: ToolInput) => string)(input);

const DESTRUCTIVE: ToolInput[] = [
	{ op: 'read-tree', rev: 'HEAD', reset: true }, { op: 'read-tree', rev: 'HEAD', merge: true, update: true },
	{ op: 'replace', action: 'delete', object: 'HEAD' }, { op: 'replace', action: 'create', object: 'HEAD~1', replacement: 'HEAD', force: true },
	{ op: 'notes', action: 'remove' }, { op: 'notes', action: 'prune' }, { op: 'notes', action: 'add', message: 'm', force: true },
];
const SAFE: Array<[ToolInput, string]> = [
	[{ op: 'read-tree', rev: 'HEAD' }, 'common'], [{ op: 'read-tree', rev: 'HEAD', merge: true }, 'common'],
	[{ op: 'replace', action: 'create', object: 'HEAD~1', replacement: 'HEAD' }, 'common'], [{ op: 'replace', action: 'list' }, 'none'],
	[{ op: 'notes', action: 'add', message: 'm' }, 'common'], [{ op: 'notes', action: 'append', message: 'm' }, 'common'],
	[{ op: 'notes', action: 'show' }, 'none'], [{ op: 'notes', action: 'list' }, 'none'],
	[{ op: 'commit-tree', tree: 'HEAD^{tree}', message: 'm' }, 'common'], [{ op: 'write-tree' }, 'common'], [{ op: 'pack-objects', revs: 'HEAD\n' }, 'none'],
	[{ op: 'update-index', refresh: true }, 'common'], [{ op: 'fast-import', stream: '' }, 'common'],
];

test('git-objects.test.ts: destructive inputs are denied with no client before git starts and safe inputs are common', async () => {
	for (const input of DESTRUCTIVE) { assert.equal(classOf(input), 'destructive', JSON.stringify(input)); }
	for (const [input, cls] of SAFE) { assert.equal(classOf(input), cls, JSON.stringify(input)); }

	registerForTests();
	standIn = installStandInGit('exit 0');
	let asked = 0;
	const gate: ApprovalGate = { async ask() { asked += 1; return 'no-client' as ApprovalDenial; } };
	_setApprovalGateForTests(() => gate);
	for (const input of DESTRUCTIVE) {
		const r = await executeTool('git_objects', { cwd: '/tmp', ...input }, toolDeps('/tmp'));
		assert.equal(r.success, false, JSON.stringify(input));
		assert.notEqual(r.failure?.kind, undefined);
	}
	assert.equal(asked, DESTRUCTIVE.length, 'every destructive call asked');
	assert.deepEqual(standIn.calls(), [], 'git did not start for any of them');
});

test('git-objects.test.ts: a failed stdin delivery reports nothing as applied', async () => {
	registerForTests();
	standIn = installStandInGit('exit 0');
	_setApprovalGateForTests(() => ({ async ask(r) { return { requestId: r.requestId, decision: 'approve' as const }; } }));
	const r = await executeTool('git_objects', { cwd: '/tmp', op: 'mktree', entries: 'x'.repeat(MAX_STDIN_BYTES) }, toolDeps('/tmp'));
	assert.equal(r.success, false);
	assert.equal(r.failure?.kind, 'rejected');
	assert.match(r.failure?.message ?? '', /could not deliver entries to git.*may have partly run/);
	assert.equal(r.data, undefined, 'no sha is reported');
});

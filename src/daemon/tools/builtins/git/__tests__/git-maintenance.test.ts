/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s8/t7: gc with pruneNow, prune, and reflog expire and delete are destructive and are denied with
 * no client before git starts; their safe forms are not.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-maintenance.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup } from '../../../__tests__/_proc.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import type { ApprovalDenial, ApprovalGate, ToolInput } from '../../../types.js';
import { gitMaintenanceTool } from '../maintenance.js';
import { gitReflogTool } from '../reflog.js';
import { registerForTests, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
afterEach(() => { _setApprovalGateForTests(undefined); standIn?.restore(); if (standIn) { cleanup(standIn.dir); } standIn = undefined; });

const classOf = (tool: { approval?: unknown }, input: ToolInput): string => (tool.approval as (i: ToolInput) => string)(input);

const DESTRUCTIVE: Array<[string, ToolInput]> = [
	['git_maintenance', { op: 'gc', pruneNow: true }], ['git_maintenance', { op: 'prune' }], ['git_maintenance', { op: 'prune', expire: 'now' }],
	['git_maintenance', { op: 'maintenance', tasks: ['reflog-expire'] }],
	['git_reflog', { op: 'expire', expire: 'now', all: true }], ['git_reflog', { op: 'delete', entries: ['HEAD@{1}'] }],
];

test('git-maintenance.test.ts: gc with prune now, prune and reflog expire and delete are denied with no client before git starts', async () => {
	for (const [id, input] of DESTRUCTIVE) { assert.equal(classOf(id === 'git_reflog' ? gitReflogTool : gitMaintenanceTool, input), 'destructive', JSON.stringify(input)); }
	for (const input of [{ op: 'gc' }, { op: 'gc', aggressive: true }, { op: 'repack', all: true }, { op: 'pack-refs' }, { op: 'multi-pack-index', action: 'write' }, { op: 'commit-graph', action: 'write' }, { op: 'maintenance', tasks: ['gc'] }, { op: 'backfill' }] as ToolInput[]) {
		assert.equal(classOf(gitMaintenanceTool, input), 'common', JSON.stringify(input));
	}
	for (const input of [{ op: 'prune', dryRun: true }, { op: 'prune-packed', dryRun: true }, { op: 'multi-pack-index', action: 'verify' }, { op: 'commit-graph', action: 'verify' }] as ToolInput[]) {
		assert.equal(classOf(gitMaintenanceTool, input), 'none', JSON.stringify(input));
	}
	for (const input of [{ op: 'show' }, { op: 'list' }, { op: 'exists', ref: 'HEAD' }, { op: 'expire', all: true, dryRun: true }, { op: 'delete', entries: ['HEAD@{1}'], dryRun: true }] as ToolInput[]) {
		assert.equal(classOf(gitReflogTool, input), 'none', JSON.stringify(input));
	}
	assert.equal(classOf(gitReflogTool, { op: 'write', ref: 'HEAD', oldOid: 'a', newOid: 'b', message: 'm' }), 'common');

	registerForTests();
	standIn = installStandInGit('exit 0');
	let asked = 0;
	const gate: ApprovalGate = { async ask() { asked += 1; return 'no-client' as ApprovalDenial; } };
	_setApprovalGateForTests(() => gate);
	for (const [id, input] of DESTRUCTIVE) {
		const r = await executeTool(id, { cwd: '/tmp', ...input }, toolDeps('/tmp'));
		assert.equal(r.success, false, JSON.stringify(input));
	}
	assert.equal(asked, DESTRUCTIVE.length, 'every destructive call asked');
	assert.deepEqual(standIn.calls(), [], 'git did not start for any of them');
});

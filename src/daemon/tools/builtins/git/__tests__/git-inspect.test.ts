/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s8/t2: git_inspect answers "no match" as an answer and never asks for approval.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-inspect.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';

import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import type { ApprovalGate } from '../../../types.js';
import { GIT_INSPECT_OPS, gitInspectTool } from '../inspect.js';
import { newRepo, registerForTests, toolDeps } from './_repo.js';

afterEach(() => { _setApprovalGateForTests(undefined); });

test('git-inspect.test.ts: a no-match exit gives an empty answer and no git_inspect op asks for approval', async () => {
	assert.ok(GIT_INSPECT_OPS.length >= 27);
	const approval = gitInspectTool.approval as (input: Record<string, unknown>) => string;
	for (const op of GIT_INSPECT_OPS) { assert.equal(approval({ op: op.name }), 'none', `${op.name} is a read`); }

	registerForTests();
	let asked = 0;
	const gate: ApprovalGate = { async ask(r) { asked += 1; return { requestId: r.requestId, decision: 'approve' }; } };
	_setApprovalGateForTests(() => gate);
	const repo = newRepo();
	try {
		const none = await executeTool('git_inspect', { cwd: repo, op: 'grep', pattern: 'nothing-matches', rev: undefined }, toolDeps(repo));
		assert.equal(none.success, true, none.output);
		assert.deepEqual(none.data, { op: 'grep', found: false, matches: [] });
		const missing = await executeTool('git_inspect', { cwd: repo, op: 'check-ignore', paths: ['x'] }, toolDeps(repo));
		assert.deepEqual(missing.data, { op: 'check-ignore', found: false, paths: [] });
		assert.equal(asked, 0, 'no approval was asked');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

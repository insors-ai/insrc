/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t7: unsafe input to the destructive new git tools is refused by the input schema
 * before any approval is asked, whether an approval subscriber is attached or not.
 * Run: npx tsx --test src/daemon/tools/builtins/git/__tests__/git-unsafe-before-approval.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup } from '../../../__tests__/_proc.js';
import { _setApprovalGateForTests, executeTool } from '../../../executor.js';
import type { ApprovalDenial, ApprovalGate } from '../../../types.js';
import { registerForTests, toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

let standIn: StandIn | undefined;
afterEach(() => { _setApprovalGateForTests(undefined); standIn?.restore(); if (standIn) cleanup(standIn.dir); standIn = undefined; });

const UNSAFE: Array<[string, Record<string, unknown>]> = [
	['git_update_ref', { ref: 'refs/heads/x\u0000y', delete: true }],
	['git_update_ref', { ref: 'refs/heads/a..b', delete: true }],
	['git_update_ref', { ref: '-refs/heads/x', delete: true }],
	['git_update_ref', { ref: 'refs/heads/x', delete: false }],
	['git_rm', { paths: ['a\u0000b'] }],
	['git_rm', { paths: [] }],
];

for (const [label, attached] of [['with an approval subscriber attached', true], ['with no subscriber attached', false]] as const) {
	test(`git-unsafe-before-approval.test.ts: unsafe input returns a rejected input failure and the approval gate is never called, ${label}`, async () => {
		registerForTests();
		standIn = installStandInGit('exit 0');
		let asked = 0;
		const gate: ApprovalGate = {
			async ask(r) { asked += 1; return attached ? { requestId: r.requestId, decision: 'approve' } : ('no-client' as ApprovalDenial); },
		};
		_setApprovalGateForTests(() => gate);
		for (const [id, input] of UNSAFE) {
			const r = await executeTool(id, { cwd: '/tmp', ...input }, toolDeps('/tmp'));
			assert.equal(r.success, false, id);
			assert.equal(r.failure?.kind, 'rejected', `${id}: rejected, not denied/no-client`);
		}
		assert.equal(asked, 0, 'the gate was not called');
		assert.deepEqual(standIn.calls(), [], 'nothing ran');
	});
}

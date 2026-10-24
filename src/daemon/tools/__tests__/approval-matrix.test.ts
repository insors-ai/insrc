/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s3/t11: the DEF ac6 reading, pinned. A tool that needs approval asks
 * when the effective mode says ask (manual, edit-auto) and not in auto; a destructive tool always
 * asks. The matrix is run through the real executor and the real ApprovalBroker: a subscribed
 * client records every request and answers it, so "asks" means a request really reached it.
 * Run: npx tsx --test src/daemon/tools/__tests__/approval-matrix.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { ApprovalBroker } from '../../approval-broker.js';
import { _setApprovalGateForTests, _setCommonApprovalForTests, executeTool } from '../executor.js';
import { _resetRegistryForTests, registerTool } from '../registry.js';
import type { ApprovalClass, CommonApprovalMode, Tool, ToolDeps, ToolResult } from '../types.js';
import { deps as baseDeps } from './_fakes.js';

const OK: ToolResult = { output: 'done', format: 'text', success: true };
const CLASSES: ApprovalClass[] = ['none', 'common', 'destructive'];
const MODES: Array<CommonApprovalMode | undefined> = [undefined, 'manual', 'edit-auto', 'auto'];
const FLAGS: CommonApprovalMode[] = ['manual', 'edit-auto', 'auto'];
const CALLERS: Array<ToolDeps['caller']> = [undefined, 'agent', 'daemon', 'workflow'];

afterEach(() => { _setApprovalGateForTests(undefined); _setCommonApprovalForTests(undefined); _resetRegistryForTests(); });

/** The ac6 reading, written out independently of the implementation. */
function expectedToAsk(cls: ApprovalClass, mode: CommonApprovalMode | undefined, flag: CommonApprovalMode): boolean {
	if (cls === 'none') return false;
	if (cls === 'destructive') return true;
	const effective = mode ?? flag;
	return effective === 'manual' || effective === 'edit-auto';
}

test('approval-matrix.test.ts: every mode against none, common and destructive tools asks exactly as the ac6 reading says, through the real executor and broker', async () => {
	_resetRegistryForTests();
	const ran: Record<string, number> = {};
	for (const cls of CLASSES) {
		const t: Tool = { id: `matrix_${cls}`, description: 'fake', inputSchema: { type: 'object' }, approval: cls, async execute() { ran[cls] = (ran[cls] ?? 0) + 1; return OK; } };
		registerTool(t);
	}
	const broker = new ApprovalBroker();
	_setApprovalGateForTests(() => broker);
	// The user's side: a client with an open approval stream that approves everything it is shown.
	const seen: string[] = [];
	broker.subscribe(frame => {
		if (frame.type === 'request') { seen.push(frame.request.toolId); queueMicrotask(() => broker.answer(frame.request.requestId, 'approve')); }
	});

	let cells = 0;
	for (const cls of CLASSES) for (const mode of MODES) for (const flag of FLAGS) for (const caller of CALLERS) {
		_setCommonApprovalForTests(() => flag);
		const before = seen.length;
		const d: ToolDeps = { ...baseDeps(), ...(mode !== undefined ? { approvalMode: mode } : {}), ...(caller !== undefined ? { caller } : {}) };
		const r = await executeTool(`matrix_${cls}`, { anything: 'goes' }, d);
		const asked = seen.length > before;
		assert.equal(asked, expectedToAsk(cls, mode, flag), `class=${cls} mode=${mode} flag=${flag} caller=${caller}`);
		assert.equal(r.success, true, 'approved calls run');
		cells += 1;
	}
	assert.equal(cells, 3 * 4 * 3 * 4);
	assert.equal(ran['destructive'], 4 * 3 * 4, 'a destructive tool asked and ran every time');

	// With nobody attached, a destructive call is denied in EVERY mode, flag and caller; a common call in auto still runs.
	const alone = new ApprovalBroker();
	_setApprovalGateForTests(() => alone);
	for (const mode of MODES) for (const flag of FLAGS) for (const caller of CALLERS) {
		_setCommonApprovalForTests(() => flag);
		const d: ToolDeps = { ...baseDeps(), ...(mode !== undefined ? { approvalMode: mode } : {}), ...(caller !== undefined ? { caller } : {}) };
		const before = ran['destructive'] ?? 0;
		const r = await executeTool('matrix_destructive', {}, d);
		assert.equal(r.failure?.kind, 'denied', `mode=${mode} flag=${flag} caller=${caller}`);
		assert.equal(r.failure?.denial, 'no-client');
		assert.equal(ran['destructive'], before, 'the tool did not run');
		const c = await executeTool('matrix_common', {}, d);
		assert.equal(c.success, !expectedToAsk('common', mode, flag), 'a common call is denied only where it asks');
	}
});

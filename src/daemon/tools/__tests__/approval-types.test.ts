/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s3/t1: the approval types.
 * Run: npx tsx --test src/daemon/tools/__tests__/approval-types.test.ts
 *
 * The unions are types, so exhaustive records pin them: adding or removing a member
 * breaks npm run build and the key counts fail here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { ApprovalClass, ApprovalDenial, CommonApprovalMode, ToolDenialReason, ToolDeps } from '../types.js';

const DENIAL: Record<ApprovalDenial, true> = { declined: true, 'timed-out': true, 'no-client': true, cancelled: true };
const CLASSES: Record<ApprovalClass, true> = { none: true, common: true, destructive: true };
const MODES: Record<CommonApprovalMode, true> = { manual: true, 'edit-auto': true, auto: true };

test('approval-types.test.ts: ApprovalDenial holds exactly the four values and ToolDeps accepts caller and approvalMode', () => {
	assert.deepEqual(Object.keys(DENIAL).sort(), ['cancelled', 'declined', 'no-client', 'timed-out']);
	assert.deepEqual(Object.keys(CLASSES).sort(), ['common', 'destructive', 'none']);
	assert.deepEqual(Object.keys(MODES).sort(), ['auto', 'edit-auto', 'manual']);

	// ApprovalDenial and ToolDenialReason are assignable both ways.
	const a: ToolDenialReason = 'cancelled' as ApprovalDenial;
	const b: ApprovalDenial = a;
	assert.equal(b, 'cancelled');

	// The new ToolDeps fields are optional and typed.
	const bare: ToolDeps = { sessionId: 's', repoPath: '/r', send: () => {}, requestId: 1 };
	const full: ToolDeps = { ...bare, caller: 'workflow', approvalMode: 'edit-auto' };
	assert.equal(bare.caller, undefined);
	assert.equal(full.caller, 'workflow');
	assert.equal(full.approvalMode, 'edit-auto');
});

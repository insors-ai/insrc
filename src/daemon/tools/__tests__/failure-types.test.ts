/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s2/t1: the failure types.
 * Run: npx tsx --test src/daemon/tools/__tests__/failure-types.test.ts
 *
 * The unions are types, so the test pins them through exhaustive records: adding or
 * removing a member makes the record fail to compile (npm run build) and the counts fail here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import type { ToolDenialReason, ToolFailureKind } from '../types.js';

const DENIAL: Record<ToolDenialReason, true> = { declined: true, 'timed-out': true, 'no-client': true, cancelled: true };
const KINDS: Record<ToolFailureKind, true> = {
	'missing-tool': true, 'missing-signin': true, unreachable: true, 'timed-out': true,
	rejected: true, 'conversion-failed': true, 'schema-mismatch': true, denied: true,
};

test('failure-types.test.ts: ToolDenialReason and ToolFailureKind hold exactly the declared values', () => {
	assert.deepEqual(Object.keys(DENIAL).sort(), ['cancelled', 'declined', 'no-client', 'timed-out']);
	assert.deepEqual(Object.keys(KINDS).sort(), [
		'conversion-failed', 'denied', 'missing-signin', 'missing-tool', 'rejected', 'schema-mismatch', 'timed-out', 'unreachable',
	]);
});

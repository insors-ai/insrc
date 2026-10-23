/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s2/t7: ToolFailureKind onto the tracker port's PortFailureKind.
 * Run: npx tsx --test src/daemon/tools/__tests__/failure-mapping.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { portKindOf, toPortFailure } from '../failure-mapping.js';
import type { PortFailureKind } from '../../../workflow/tracker/port.js';
import type { ToolFailureKind } from '../types.js';

const EXPECTED: Record<ToolFailureKind, PortFailureKind> = {
	'missing-tool': 'missing-tool',
	'missing-signin': 'missing-signin',
	'unreachable': 'unreachable',
	'timed-out': 'unreachable',
	'rejected': 'rejected',
	'conversion-failed': 'rejected',
	'schema-mismatch': 'rejected',
	'denied': 'rejected',
};

test('failure-mapping.test.ts: each ToolFailureKind maps onto a PortFailureKind, one test per kind', async t => {
	const PORT_KINDS = new Set<PortFailureKind>(['missing-tool', 'missing-signin', 'unreachable', 'rejected']);
	for (const [kind, port] of Object.entries(EXPECTED) as Array<[ToolFailureKind, PortFailureKind]>) {
		await t.test(kind, () => {
			assert.equal(portKindOf(kind), port);
			assert.ok(PORT_KINDS.has(portKindOf(kind)));
			assert.deepEqual(toPortFailure({ kind, message: 'the reason' }), { kind: port, reason: 'the reason' });
		});
	}
});

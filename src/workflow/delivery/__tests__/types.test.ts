/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S001 / t1 — delivery types. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DeliveryStoreUnreadableError } from '../types.js';
import type { DeliveryRoute, DeliveryStage, StageAnnotation, StagePassResult } from '../types.js';

test('DeliveryStoreUnreadableError carries the store path and the underlying message', () => {
	const err = new DeliveryStoreUnreadableError('/repo/.insrc/artifacts', 'EACCES: permission denied');
	assert.ok(err instanceof Error);
	assert.equal(err.name, 'DeliveryStoreUnreadableError');
	assert.equal(err.storePath, '/repo/.insrc/artifacts');
	assert.match(err.message, /\/repo\/\.insrc\/artifacts/);
	assert.match(err.message, /EACCES: permission denied/);
});

// E1 / S002 / t1 — the sc4 types. Each table is typed Record<Union, true>, so a
// member missing from the table or a key that is not a member fails to compile;
// the runtime assertions pin the HLD's member lists.

const STAGES: Record<DeliveryStage, true> = {
	'scoped': true, 'design-plan': true, 'ready-design-approved': true,
	'ready-plan-approved': true, 'build-recorded': true, 'complete': true,
};
const ROUTES: Record<DeliveryRoute, true> = {
	'full-chain': true, 'feature': true, 'small': true, 'small-bugfix': true,
	'sized-bugfix': true, 'trivial': true, 'unknown': true,
};

test('the stage and route types list exactly the HLD members', () => {
	assert.deepEqual(Object.keys(STAGES), ['scoped', 'design-plan', 'ready-design-approved', 'ready-plan-approved', 'build-recorded', 'complete']);
	assert.deepEqual(Object.keys(ROUTES), ['full-chain', 'feature', 'small', 'small-bugfix', 'sized-bugfix', 'trivial', 'unknown']);
	const annotation: StageAnnotation = { itemId: 'E1:S001', stage: 'scoped', route: 'full-chain', reason: { text: 'no design, plan or build record', artifactIds: [] } };
	const result: StagePassResult = { stages: new Map([[annotation.itemId, annotation]]), notices: [] };
	assert.equal(result.stages.get('E1:S001')?.stage, 'scoped');
});

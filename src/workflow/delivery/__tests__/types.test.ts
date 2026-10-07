/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S001 / t1 — delivery types. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DeliveryStoreUnreadableError } from '../types.js';

test('DeliveryStoreUnreadableError carries the store path and the underlying message', () => {
	const err = new DeliveryStoreUnreadableError('/repo/.insrc/artifacts', 'EACCES: permission denied');
	assert.ok(err instanceof Error);
	assert.equal(err.name, 'DeliveryStoreUnreadableError');
	assert.equal(err.storePath, '/repo/.insrc/artifacts');
	assert.match(err.message, /\/repo\/\.insrc\/artifacts/);
	assert.match(err.message, /EACCES: permission denied/);
});

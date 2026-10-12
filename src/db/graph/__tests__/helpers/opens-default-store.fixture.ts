/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A FIXTURE, not part of any sweep (its name does not end in `.test.ts`, so no
 * test glob picks it up): a test file that opens the graph store without setting a path, as the
 * files repaired in Epic c2ba6fa6, Story s4, t9 used to. It is run only by
 * no-live-store-in-tests.test.ts, in a temporary home, to prove that that
 * test's check can see such an open.
 */

import { test } from 'node:test';
import { homedir, tmpdir } from 'node:os';
import assert from 'node:assert/strict';

import { closeGraphStore, declareLiveStoreOwner, getGraphStore } from '../../store.js';

test('opens the store at the default path of a temporary home', async () => {
	assert.ok(homedir().startsWith(tmpdir()) || homedir().startsWith('/private') || homedir().startsWith('/tmp'), 'never run against a real home');
	// Only a declared process gets the store at the default path (Story s4, t10).
	declareLiveStoreOwner();
	await getGraphStore();
	await closeGraphStore();
});

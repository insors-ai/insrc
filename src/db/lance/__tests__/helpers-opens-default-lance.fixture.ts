/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A FIXTURE, not part of any sweep (its name does not end in `.test.ts`): a
 * test file that opens the vector store at the default path, as the files
 * repaired in Epic c2ba6fa6, Story s11, t2 used to. Run only by
 * no-live-vector-store-in-tests.test.ts, in a temporary home, to prove its
 * check can see such an open.
 */

import { test } from 'node:test';
import { homedir, tmpdir } from 'node:os';
import assert from 'node:assert/strict';

import { closeLanceConn, getLanceConn } from '../conn.js';
import { declareLiveStoreOwner } from '../../graph/store.js';

test('opens the vector store at the default path of a temporary home', async () => {
	assert.ok(homedir().startsWith(tmpdir()) || homedir().startsWith('/private') || homedir().startsWith('/tmp'), 'never run against a real home');
	declareLiveStoreOwner();
	await getLanceConn();
	await closeLanceConn();
});

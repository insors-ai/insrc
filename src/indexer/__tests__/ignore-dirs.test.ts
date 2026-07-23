/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IGNORE_DIRS } from '../watcher.js';

// Guards the doc-summariser churn fix: the watcher + the git-aware file-walker
// both key off IGNORE_DIRS. `out` (insrc's build output) and `.insrc` (daemon-
// managed per-repo artifacts) are not source — indexing/watching them re-fires
// doc-summarisation on every build / workflow-run and floods the queue.

test('IGNORE_DIRS excludes build-output + daemon-artifact dirs', () => {
	const set = new Set(IGNORE_DIRS);
	assert.ok(set.has('out'), 'out/ (insrc build output) must be ignored');
	assert.ok(set.has('.insrc'), '.insrc/ (daemon-managed artifacts) must be ignored');
	// the pre-existing conventions stay
	for (const d of ['node_modules', '.git', 'dist', 'build']) {
		assert.ok(set.has(d), `${d} must remain ignored`);
	}
});

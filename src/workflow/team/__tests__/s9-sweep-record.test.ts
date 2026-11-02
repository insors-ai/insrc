/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story s9, task t7: the outcome section of docs/plans/team-workflow.md lists the sweep result and the open items.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/s9-sweep-record.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('the outcome section of team-workflow.md lists the sweep result and the open items', () => {
	const plan = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'docs/plans/team-workflow.md'), 'utf8');
	const at = plan.indexOf('## s9 outcome');
	assert.ok(at >= 0, 'the s9 outcome section exists');
	const section = plan.slice(at);
	assert.match(section, /\*\*Sweep/);
	assert.match(section, /No new failure/);
	assert.match(section, /No new skipped test/);
	assert.match(section, /peer-state-store-leakfree/, 'the pre-existing failures are listed');
	assert.match(section, /\*\*Open items\.\*\*/);
	assert.match(section, /smoke test/);
	assert.match(section, /AMD-315d510cb28100e2-31/);
	assert.match(section, /git-hook installer/);
});

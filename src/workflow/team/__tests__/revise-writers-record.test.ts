/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story f32c3abf4a55494b/s1, task t5: the revise-writers section of docs/plans/team-workflow.md records the decisions, the exemptions,
 * the sweep result and the open items.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/revise-writers-record.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('the revise-writers section of team-workflow.md records the decisions, the exemptions, the sweep result and the open items', () => {
	const plan = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'docs/plans/team-workflow.md'), 'utf8');
	const at = plan.indexOf('## Revise writers');
	assert.ok(at >= 0, 'the revise-writers section exists');
	const section = plan.slice(at);
	for (const decision of [/assertMayReviseDraft/, /Comments are holder-only/, /gated as `author`/, /finalizeDefineExtend/, /`gatedBy`/]) assert.match(section, decision);
	for (const exemption of [/unit-head\.ts/, /BUILD and TESTS records/, /task-set\.ts/]) assert.match(section, exemption, 'the exemptions are listed');
	assert.match(section, /\*\*Sweep/);
	assert.match(section, /No new failure/);
	assert.match(section, /No new skipped test/);
	assert.match(section, /peer-state-store-leakfree/, 'the pre-existing failures are listed');
	assert.match(section, /\*\*Open items\.\*\*/);
	assert.match(section, /head-ahead-of-log/);
	assert.match(section, /gh_label/);
});

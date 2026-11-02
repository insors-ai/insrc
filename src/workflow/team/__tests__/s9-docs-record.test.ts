/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story s9, task t6: the decisions and the amendments are written in docs/plans/team-workflow.md, and docs/workflow.md describes the
 * automatic refresh and its limits.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/s9-docs-record.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const doc = (rel: string): string => readFileSync(join(import.meta.dirname, '..', '..', '..', '..', rel), 'utf8');

test('team-workflow.md records the amendment and the s9 decisions and workflow.md describes the automatic refresh', () => {
	const plan = doc('docs/plans/team-workflow.md');
	const section = plan.slice(plan.indexOf('## s9 build decisions'));
	assert.ok(section.length > 0 && plan.includes('## s9 build decisions'), 'the s9 build decisions section exists');
	assert.match(section, /AMD-315d510cb28100e2-31/, 'the sc1 methodAdd amendment');
	assert.match(section, /readIssueStatus/);
	assert.match(section, /status-read/);
	assert.match(section, /AMD-315d510cb28100e2-32/, 'the nonFunctional.retarget amendment');
	assert.match(section, /Scope as written/);
	assert.match(section, /Hooks only for the repository root/);
	assert.match(section, /Signal propagation verified/);

	const guide = doc('docs/workflow.md');
	assert.match(guide, /Automatic status refresh and issues at first draft/);
	for (const limit of [/120-second budget/, /never fails the git tool/, /terminal or an IDE/, /linked worktree/, /insrc workflow sync/, /tracker type `none`/]) {
		assert.match(guide, limit);
	}
});

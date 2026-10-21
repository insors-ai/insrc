import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { unitMembers } from '../lifecycle.js';
import type { ChildStatusReader } from '../lifecycle.js';
import { H } from './store-kit.js';

const reader = (children: string[]): ChildStatusReader => ({
	childrenOfStrict: async () => ({ children, unreadable: [] }),
	statusOf: async () => 'draft',
});

describe('unitMembers', () => {
	it("a Story's members keep each DIAG sequence and never include the unit itself", async () => {
		const STORY = `STORY-${H}-s1`;
		const kids = [`TASK-${H}-s1-t1`, `TASKS-${H}-s1`, `DIAG-${H}-s1-1`, `DIAG-${H}-s1-12`, `DIAG-${H}-s1-3`];
		const fixed = ['LLD', 'PLAN', 'BUILD', 'CR', 'TESTS', 'EXT'].map(kind => `${kind}-${H}-s1`);

		// the unit is the STORY head: its fixed-id records, its TASKS and its DIAG heads, but not itself and not its Tasks
		const members = await unitMembers(STORY, reader(kids));
		assert.deepEqual([...members].sort(), [...fixed, `TASKS-${H}-s1`, `DIAG-${H}-s1-1`, `DIAG-${H}-s1-12`, `DIAG-${H}-s1-3`].sort());
		assert.ok(!members.includes(STORY), 'a unit is never its own member');
		assert.ok(!members.some(m => m.startsWith('TASK-')), 'Tasks complete through their own roll-up');

		// an Epic's members are EPIC, DEF and HLD, less the unit
		assert.deepEqual([...await unitMembers(`EPIC-${H}`, reader([]))].sort(), [`DEF-${H}`, `HLD-${H}`]);

		// a record is not a unit: it has no members
		assert.deepEqual(await unitMembers(`BUILD-${H}-s1`, reader(kids)), []);
		await assert.rejects(unitMembers('nope', reader([])));
	});
});

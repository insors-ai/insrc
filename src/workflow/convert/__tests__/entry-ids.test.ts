import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MIGRATED_PARTS, migratedEntryId } from '../entry-ids.js';

describe('entry-ids', () => {
	it('entry-ids.test.ts: migrated entry ids are stable and distinct per part', () => {
		const id = 'LLD-2f27754d4ad00b8e-s1';
		assert.equal(migratedEntryId(id), 'migrated-LLD-2f27754d4ad00b8e-s1');
		assert.equal(migratedEntryId(id), migratedEntryId(id), 'the same inputs give the same id');
		const all = [migratedEntryId(id), ...MIGRATED_PARTS.map(p => migratedEntryId(id, p))];
		assert.equal(new Set(all).size, all.length, 'every part has its own id');
		assert.deepEqual(MIGRATED_PARTS.map(p => migratedEntryId(id, p)), ['approve', 'reject', 'review', 'mark-stale'].map(p => `migrated-${id}-${p}`));
		assert.notEqual(migratedEntryId('LLD-a-s1'), migratedEntryId('LLD-a-s2'), 'distinct per artifact');
	});
});

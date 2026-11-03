/**
 * Epic c2ba6fa6, Story s2, t2 -- the sc2 types and the mapping of a
 * RelationWrite onto the Relation shape the store's writers take.
 *
 * Run: npx tsx --test src/db/__tests__/file-commit-types.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { relationOfWrite } from '../file-commit.js';
import type { RelationWrite } from '../../shared/types.js';

test('a RelationWrite with a stored target maps to a resolved Relation, and one with a pending target to an unresolved Relation with the same meta', () => {
	const meta = { repo: '/r', file: '/r/a.ts', line: 3 };
	const stored: RelationWrite = { from: 'a', kind: 'CALLS', target: { stored: 'b', meta: { repo: '/r' } }, evidence: 'unknown' };
	const pending: RelationWrite = { from: 'a', kind: 'IMPORTS', target: { pending: { to: './b', meta } }, evidence: 'unknown' };

	assert.deepEqual(relationOfWrite(stored), { kind: 'CALLS', from: 'a', to: 'b', resolved: true, meta: { repo: '/r' } });
	assert.deepEqual(relationOfWrite(pending), { kind: 'IMPORTS', from: 'a', to: './b', resolved: false, meta });
	// No meta on a stored target: none on the Relation either.
	assert.deepEqual(relationOfWrite({ from: 'a', kind: 'CALLS', target: { stored: 'b' }, evidence: 'unknown' }), { kind: 'CALLS', from: 'a', to: 'b', resolved: true });
});


/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 / S001 / t2 — notice module. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { NOTICE_ATTENTION, makeNotice, sortNotices } from '../notice.js';
import type { NoticeCode } from '../types.js';

test('NOTICE_ATTENTION is true for exactly record-unreadable, identity-ambiguous, unresolved-parent and validation-conflict', () => {
	const attention = (Object.keys(NOTICE_ATTENTION) as NoticeCode[]).filter(c => NOTICE_ATTENTION[c]).sort();
	assert.deepEqual(attention, ['identity-ambiguous', 'record-unreadable', 'unresolved-parent', 'validation-conflict']);
	assert.equal(Object.keys(NOTICE_ATTENTION).length, 12);
});

test('makeNotice sorts and de-duplicates ids and takes attention from the table', () => {
	const n = makeNotice('unresolved-parent', 'parent not found', {
		itemIds:     ['b', 'a', 'b'],
		artifactIds: ['ISSUE-2', 'ISSUE-1'],
	});
	assert.deepEqual(n.itemIds, ['a', 'b']);
	assert.deepEqual(n.artifactIds, ['ISSUE-1', 'ISSUE-2']);
	assert.deepEqual(n.fileNames, []);
	assert.equal(n.attention, true);
	assert.equal(makeNotice('unattached-spec', 'x', {}).attention, false);
});

test('sortNotices gives one order for every permutation and drops exact duplicates', () => {
	const a = makeNotice('record-unreadable', 'bad file', { fileNames: ['z.json'] });
	const b = makeNotice('identity-ambiguous', 'two forms', { artifactIds: ['LLD-1'] });
	const c = makeNotice('identity-ambiguous', 'two forms', { artifactIds: ['LLD-0'] });
	const expected = sortNotices([a, b, c]);
	for (const perm of [[c, b, a], [b, a, c], [a, c, b], [b, c, a]]) {
		assert.deepEqual(sortNotices(perm), expected);
	}
	assert.deepEqual(expected.map(n => n.artifactIds[0] ?? n.fileNames[0]), ['LLD-0', 'LLD-1', 'z.json']);
	assert.equal(sortNotices([a, a, b]).length, 2);
});

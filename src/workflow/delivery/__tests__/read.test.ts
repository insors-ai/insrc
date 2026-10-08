/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** E1 — the field readers every delivery pass shares. */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { asObject, storyOrdinalOf, taskOrdinalOf } from '../read.js';

test('asObject accepts only plain objects', () => {
	assert.deepEqual(asObject({ a: 1 }), { a: 1 });
	for (const v of [null, undefined, [], ['a'], 'x', 3, true]) assert.equal(asObject(v), null);
});

test('the ordinal readers parse story and task ids and return null for anything else, never throwing', () => {
	assert.deepEqual(['s1', 'S1', 'S001', 's12'].map(storyOrdinalOf), [1, 1, 1, 12]);
	assert.deepEqual(['t1', 't07'].map(taskOrdinalOf), [1, 7]);
	assert.deepEqual(['t1', 'x9', '', 'S'].map(storyOrdinalOf), [null, null, null, null]);
	assert.deepEqual(['S001', 'T1', 'x9', ''].map(taskOrdinalOf), [null, null, null, null]);
});

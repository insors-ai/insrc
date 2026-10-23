/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s2/t4: the key-value cross-check.
 * Run: npx tsx --test src/daemon/tools/__tests__/cross-check.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { crossCheck } from '../cross-check.js';

test('cross-check.test.ts: key-value matching normalises whitespace and case and drops surrounding quotes', () => {
	assert.equal(crossCheck('  Created   fix-login \n on  main ', ['Fix-Login']).ok, true);
	assert.equal(crossCheck('branch fix-login ready', ['"Fix-Login"', "'main'"]).missing.join(','), "'main'");
	assert.equal(crossCheck('branch main ready', ["'main'", '`main`']).ok, true);
	assert.equal(crossCheck('see src/a/b.ts:12', ['src/a/b.ts']).ok, true);
});

test("cross-check.test.ts: an alphanumeric key value matches on token boundaries, so '12' is not found in '123'", () => {
	assert.equal(crossCheck('issue 123 created', ['12']).ok, false);
	assert.equal(crossCheck('issue 123 created', ['123']).ok, true);
	assert.equal(crossCheck('issue #12 created', ['12']).ok, true);
	assert.equal(crossCheck('prefix12 and 12suffix', ['12']).ok, false);
	assert.equal(crossCheck('a (v1.2.3) b', ['v1.2.3']).ok, true);
});

test('cross-check.test.ts: an empty keyValues result is accepted on schema alone', () => {
	const r = crossCheck('nothing to commit', []);
	assert.deepEqual(r, { ok: true, missing: [], checked: 0 });
	assert.equal(crossCheck('x', ['', '  ', '""']).checked, 0);
});

test('cross-check.test.ts: the missing values are returned by name', () => {
	const r = crossCheck('alpha beta', ['alpha', 'Gamma', 'delta']);
	assert.equal(r.ok, false);
	assert.deepEqual(r.missing, ['Gamma', 'delta']);
	assert.equal(r.checked, 3);
});

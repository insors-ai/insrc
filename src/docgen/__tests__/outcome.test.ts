/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the docgen DocGenOutcome combinators (s1 · t2).
 *
 * The load-bearing property: non-ok variants short-circuit outward with their
 * payload untouched (k11), so a reason/symbol/depthUsed raised deep in
 * extraction reaches the caller verbatim.
 *
 * Run: npx tsx --test src/docgen/__tests__/outcome.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { map, flatMap, isOk, ok, emptyScope, notFound, truncated, fallbackUnavailable, sourceNotReady } from '../outcome.js';
import type { DocGenOutcome } from '../types.js';

test('map transforms the ok payload', () => {
	const r = map(ok(2), n => n * 3);
	assert.deepEqual(r, { status: 'ok', value: 6 });
});

test('map passes non-ok variants through UNCHANGED (field-for-field)', () => {
	const es: DocGenOutcome<number> = emptyScope('no types in scope');
	const out = map(es, n => n + 1);
	assert.equal(out, es);                         // same reference — untouched
	assert.deepEqual(out, { status: 'empty-scope', reason: 'no types in scope' });
});

test('flatMap chains the ok arm through a fallible stage', () => {
	const r = flatMap(ok(2), n => (n > 0 ? ok(`n=${n}`) : notFound('x')));
	assert.deepEqual(r, { status: 'ok', value: 'n=2' });
});

test('flatMap short-circuits a non-ok input WITHOUT invoking f', () => {
	let called = false;
	const nf: DocGenOutcome<number> = notFound('Widget');
	const out = flatMap(nf, n => { called = true; return ok(n); });
	assert.equal(called, false);
	assert.equal(out, nf);
	assert.deepEqual(out, { status: 'not-found', symbol: 'Widget' });
});

test('flatMap surfaces a non-ok result produced by f', () => {
	const out = flatMap(ok(3), () => truncated(5));
	assert.deepEqual(out, { status: 'truncated', depthUsed: 5 });
});

test('a reason raised deep survives two flatMap hops verbatim (k11)', () => {
	const detected = emptyScope('zero rows at codec read for scope src/foo');
	const piped = flatMap(flatMap(detected, () => ok(1)), () => ok(2));
	assert.deepEqual(piped, detected);
});

test('isOk narrows the ok arm', () => {
	const o: DocGenOutcome<number> = ok(7);
	assert.equal(isOk(o), true);
	if (isOk(o)) assert.equal(o.value, 7);
	assert.equal(isOk(notFound('z')), false);
});

test('constructors build the exact variant shapes', () => {
	assert.deepEqual(sourceNotReady('indexing'), { status: 'source-not-ready', reason: 'indexing' });
	assert.deepEqual(fallbackUnavailable('missing d2', 'install d2'),
		{ status: 'fallback-unavailable', reason: 'missing d2', remedy: 'install d2' });
});

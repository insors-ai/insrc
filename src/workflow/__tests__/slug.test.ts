/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Slug derivation unit tests.
 *
 * Slugs are display-only post-hash-migration; filesystem collisions
 * no longer matter (files are keyed by 16-char Epic hash). So only
 * `deriveSlug` is under test here.
 *
 * Run:
 *   npx tsx --test src/insrc/workflow/__tests__/slug.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveSlug } from '../slug.js';

test('deriveSlug drops stopwords + hyphenates the rest', () => {
	assert.equal(
		deriveSlug('Add rate limiting to the RPC layer'),
		'add-rate-limiting-rpc-layer',
	);
});

test('deriveSlug caps at MAX_TOKENS (6) distinctive words', () => {
	const slug = deriveSlug('one two three four five six seven eight');
	assert.equal(slug, 'one-two-three-four-five-six');
});

test('deriveSlug lowercases + strips punctuation', () => {
	assert.equal(
		deriveSlug('Fix the CLI!!! flag handling (broken since v1.2)'),
		'fix-cli-flag-handling-broken-since',
	);
});

test('deriveSlug rejects all-stopword focus', () => {
	assert.throws(() => deriveSlug('the a an is'));
});

test('deriveSlug rejects empty', () => {
	assert.throws(() => deriveSlug(''));
});

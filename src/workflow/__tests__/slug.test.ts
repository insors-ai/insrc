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
import { safeDeriveSlug } from '../orchestrator.js';

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

// --- safeDeriveSlug: the finalize-safe wrapper (S002 ac1) ---------------------
// A run started without a focus reaches finalize with intent.focus === undefined;
// safeDeriveSlug must return a stable non-empty default instead of throwing.

test('safeDeriveSlug(undefined) returns a stable non-empty default, no throw', () => {
	assert.equal(safeDeriveSlug(undefined), 'untitled');
});

test("safeDeriveSlug('') returns a stable non-empty default, no throw", () => {
	assert.equal(safeDeriveSlug(''), 'untitled');
});

test('safeDeriveSlug(valid focus) is byte-identical to deriveSlug (happy path unchanged)', () => {
	const focus = 'Add rate limiting to the RPC layer';
	assert.equal(safeDeriveSlug(focus), deriveSlug(focus));
	assert.equal(safeDeriveSlug(focus), 'add-rate-limiting-rpc-layer');
});

test('safeDeriveSlug on an all-stopword/degenerate focus falls back to a non-empty slug (deriveSlug throws)', () => {
	// deriveSlug throws on 'the a an is'; the wrapper must not propagate it.
	assert.doesNotThrow(() => safeDeriveSlug('the a an is'));
	assert.ok(safeDeriveSlug('the a an is').length > 0);
	// an all-punctuation focus slices to empty → the '|| untitled' guard applies.
	assert.equal(safeDeriveSlug('!!!'), 'untitled');
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The two party readers: who authored a piece of work, who reviewed it.
 * (LLD-1716f77ba9ba017b-S001, test T1; plan task t1.)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { authorPartyOf, otherParty, reviewerPartyOf } from '../party.js';

const out = (model: unknown) => ({ role: 'synthesize', tier: 'core', runner: 'cli-claude', model });

test('T1 author: the explicit field wins over a contradicting model label', () => {
	assert.equal(authorPartyOf({ authoredBy: 'daemon', attribution: { outputs: [out('client')] } }), 'daemon');
	assert.equal(authorPartyOf({ authoredBy: 'controller', attribution: { outputs: [out('opus')] } }), 'controller');
});

test('T1 author: without the field the attribution labels decide', () => {
	assert.equal(authorPartyOf({ attribution: { outputs: [out('client'), out('client')] } }), 'controller');
	assert.equal(authorPartyOf({ attribution: { outputs: [out('opus'), out('qwen3.6:27b')] } }), 'daemon');
	assert.equal(authorPartyOf({ attribution: { outputs: [out('client'), out('opus')] } }), 'unknown', 'a mixture');
	assert.equal(authorPartyOf({ attribution: { outputs: [] } }), 'unknown', 'no entries');
	assert.equal(authorPartyOf({ attribution: { outputs: [out('opus'), out(undefined)] } }), 'unknown', 'an entry with no label');
});

test('T1 author: nothing stored reads as unknown, and so does a BUILD record with no field', () => {
	assert.equal(authorPartyOf({}), 'unknown');
	assert.equal(authorPartyOf({ workflow: 'build', epicHash: 'abcd', storyId: 'S001', createdAt: 'x' }), 'unknown');
	assert.equal(authorPartyOf({ authoredBy: 'someone-else' }), 'unknown', 'a value that is not a party is not trusted');
	for (const bad of [undefined, null, 'meta', 7]) assert.equal(authorPartyOf(bad), 'unknown');
});

test('T1 reviewer: the explicit field wins over a contradicting model label', () => {
	assert.equal(reviewerPartyOf({ reviewedBy: 'daemon', model: 'client' }), 'daemon');
	assert.equal(reviewerPartyOf({ reviewedBy: 'controller', model: 'opus' }), 'controller');
});

test('T1 reviewer: without the field the model label decides', () => {
	assert.equal(reviewerPartyOf({ model: 'client' }), 'controller');
	assert.equal(reviewerPartyOf({ model: 'opus' }), 'daemon');
	assert.equal(reviewerPartyOf({ model: 'ollama:qwen3.6:27b' }), 'daemon');
});

test('T1 reviewer: nothing stored reads as unknown', () => {
	assert.equal(reviewerPartyOf({}), 'unknown');
	assert.equal(reviewerPartyOf({ model: '' }), 'unknown');
	assert.equal(reviewerPartyOf({ reviewedBy: 'nobody' }), 'unknown');
	for (const bad of [undefined, null, 'review', 7]) assert.equal(reviewerPartyOf(bad), 'unknown');
});

test('T1 the other party', () => {
	assert.equal(otherParty('controller'), 'daemon');
	assert.equal(otherParty('daemon'), 'controller');
});

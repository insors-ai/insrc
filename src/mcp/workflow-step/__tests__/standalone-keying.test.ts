/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { augmentStandaloneParams, epicKeyFor } from '../phases/start.js';

const RUN_ID = 'wf-1700000000000-abc123';

test('augmentStandaloneParams: no-op unless standalone===true', () => {
	const p: Record<string, unknown> = { epicHash: undefined };
	augmentStandaloneParams(p, RUN_ID);
	assert.equal(p['epicHash'], undefined);
	assert.equal(p['storyId'], undefined);
});

test('augmentStandaloneParams: standalone mints a 16-char self-hash + default storyId', () => {
	const p: Record<string, unknown> = { standalone: true };
	augmentStandaloneParams(p, RUN_ID);
	assert.match(p['epicHash'] as string, /^[0-9a-f]{16}$/, 'minted epicHash is a 16-char hex');
	assert.equal(p['storyId'], 'S001');
});

test('augmentStandaloneParams: is deterministic in the runId (same runId → same hash)', () => {
	const a: Record<string, unknown> = { standalone: true };
	const b: Record<string, unknown> = { standalone: true };
	augmentStandaloneParams(a, RUN_ID);
	augmentStandaloneParams(b, RUN_ID);
	assert.equal(a['epicHash'], b['epicHash']);
});

test('augmentStandaloneParams: preserves a caller-provided epicHash + storyId', () => {
	const p: Record<string, unknown> = { standalone: true, epicHash: '0123456789abcdef', storyId: 'S007' };
	augmentStandaloneParams(p, RUN_ID);
	assert.equal(p['epicHash'], '0123456789abcdef');
	assert.equal(p['storyId'], 'S007');
});

test('epicKeyFor: a standalone design.story keys by the minted (augmented) epicHash', () => {
	const p: Record<string, unknown> = { standalone: true };
	augmentStandaloneParams(p, RUN_ID);
	const key = epicKeyFor('design.story', 'add a flag', p, RUN_ID);
	assert.equal(key, p['epicHash'], 'epicKeyFor reads the augmented hash — no throw for the missing caller epicHash');
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t4: structured-output.ts now imports
 * VibeTurnError from the adapter module -- the retry classifier's instanceof check
 * must distinguish THIS class's instances as the non-retryable refusal marker.
 *
 * (The sibling test structured-retry-vibe-refusal.test.ts still constructs a
 * vibe-session.js VibeTurnError -- a DIFFERENT class now that structured-output.ts
 * classifies against the adapter's own class. Re-pointing that file is t6's scope
 * per the approved LLD migration step 5, not this Task's.)
 *
 * Run: npx tsx --test src/agent/providers/__tests__/structured-retry-vibe-adapter-refusal.test.ts
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { withStructuredRetry } from '../structured-output.js';
import { VibeTurnError } from '../../../shared/vibe-adapter.js';

test('structured-output.ts imports VibeTurnError from the adapter module with no behavior change at this step', async () => {
	for (const state of ['not-sent', 'possibly-sent', 'accepted'] as const) {
		const refusal = new VibeTurnError(state, 'saved-session', new Error('saved refusal detail'));
		let calls = 0;
		await assert.rejects(withStructuredRetry(async () => { calls++; throw refusal; }, () => ({ ok: true, value: {} }), 3), error => error === refusal);
		assert.equal(calls, 1, 'the adapter\'s VibeTurnError is still the non-retryable refusal marker, not retried');
	}
});

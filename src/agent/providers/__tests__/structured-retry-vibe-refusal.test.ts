import assert from 'node:assert/strict';
import test from 'node:test';
import { withStructuredRetry } from '../structured-output.js';
import { VibeTurnError } from '../../../shared/vibe-session.js';

test('Saved structured retry preserves Vibe refusal identity and never retries', async () => {
	for (const state of ['not-sent', 'possibly-sent', 'accepted'] as const) {
		const refusal = new VibeTurnError(state, 'saved-session', new Error('saved refusal detail'));
		let calls = 0;
		await assert.rejects(withStructuredRetry(async () => { calls++; throw refusal; }, () => ({ ok: true, value: {} }), 3), error => error === refusal);
		assert.equal(calls, 1);
	}
});

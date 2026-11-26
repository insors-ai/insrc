/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t5: the plain-CLI path end to end
 * against the real installed `vibe` binary, through CliProvider's rewired
 * complete()/completeStructured() -- confirms the adapter rewire works for
 * real, not just against scripted fixtures, and that export.json-based
 * exit-evidence readback happens on a real run.
 *
 * Gate behind INSRC_LIVE_TESTS=1 -- each call costs real billed tokens.
 * Run: INSRC_LIVE_TESTS=1 npx tsx --test src/agent/providers/__tests__/cli-provider-vibe-adapter.live.test.ts
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CliProvider } from '../cli-provider.js';

const GATE = process.env['INSRC_LIVE_TESTS'] === '1';
const skip = !GATE && 'set INSRC_LIVE_TESTS=1 (real CLI calls)';

test('live: the plain-CLI path end to end -- complete() against the real vibe binary returns real text', { skip }, async () => {
	const provider = new CliProvider({ kind: 'vibe', timeoutMs: 60_000 });
	const result = await provider.complete([{ role: 'user', content: 'respond with exactly: OK' }]);
	assert.ok(result.text.length > 0);
});

test('live: completeStructured() against the real vibe binary validates a real structured answer', { skip }, async () => {
	const provider = new CliProvider({ kind: 'vibe', timeoutMs: 60_000 });
	const value = await provider.completeStructured<{ ok: boolean }>(
		[{ role: 'user', content: 'Reply with the JSON object {"ok": true} and nothing else.' }],
		{ type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
	);
	assert.equal(value.ok, true);
});

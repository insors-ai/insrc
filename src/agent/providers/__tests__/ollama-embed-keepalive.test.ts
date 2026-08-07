/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (embedding keep-alive) — OllamaProvider.embed() passes keep_alive to the
 * Ollama client so the embed model stays resident. Exercised against a fake
 * client that records the args; no live Ollama.
 *
 * Run: npx tsx --test src/agent/providers/__tests__/ollama-embed-keepalive.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OllamaProvider } from '../ollama.js';

/** A fake Ollama client that records the args of the last embed() call. */
function fakeClient() {
	const calls: Array<Record<string, unknown>> = [];
	return {
		calls,
		embed: async (args: Record<string, unknown>) => {
			calls.push(args);
			return { embeddings: [[0.1, 0.2, 0.3]] };
		},
	};
}

function providerWith(keepAlive: string) {
	const p = new OllamaProvider();
	const fake = fakeClient();
	// readonly is compile-time only; override at runtime for the test.
	(p as unknown as { client: unknown }).client = fake;
	(p as unknown as { embeddingKeepAlive: string }).embeddingKeepAlive = keepAlive;
	return { p, fake };
}

test('embed() passes the configured keep_alive to client.embed', async () => {
	const { p, fake } = providerWith('30m');
	await p.embed('hello world');
	assert.equal(fake.calls.length, 1);
	assert.equal(fake.calls[0]!['keep_alive'], '30m');
	assert.equal(fake.calls[0]!['input'], 'hello world');
	assert.ok('model' in fake.calls[0]!);
});

test('embed() passes a custom keep_alive verbatim (-1 / 0 / 24h)', async () => {
	for (const v of ['-1', '0', '24h']) {
		const { p, fake } = providerWith(v);
		await p.embed('x');
		assert.equal(fake.calls[0]!['keep_alive'], v);
	}
});

test('embed() return value is unchanged by keep_alive (returns embeddings[0])', async () => {
	const { p } = providerWith('24h');
	const vec = await p.embed('anything');
	assert.deepEqual(vec, [0.1, 0.2, 0.3]);
});

test('a default-constructed provider has a non-empty embeddingKeepAlive (config-sourced, coalesced)', () => {
	const p = new OllamaProvider();
	const ka = (p as unknown as { embeddingKeepAlive: string }).embeddingKeepAlive;
	assert.equal(typeof ka, 'string');
	assert.notEqual(ka.trim(), '', 'embed() must never be handed an empty keep_alive');
});

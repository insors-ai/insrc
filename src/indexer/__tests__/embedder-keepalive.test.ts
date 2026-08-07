/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (embedding keep-alive) — the indexer's OWN Ollama client (src/indexer/embedder.ts,
 * distinct from OllamaProvider) is the hot path during index bursts (embedEntities/
 * embedQuery/embedText). Every one of its `ollama.embed(...)` calls MUST pass keep_alive
 * so the embed model stays resident. This static guard fails if a future embed call
 * forgets it (the exact regression this story fixed).
 *
 * Run: npx tsx --test src/indexer/__tests__/embedder-keepalive.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(fileURLToPath(new URL('../embedder.ts', import.meta.url)), 'utf8');

test('embedder.ts derives its keep_alive from the models.local.embeddingKeepAlive config', () => {
	assert.match(SRC, /_localDefaults\.embeddingKeepAlive/, 'must source keep_alive from local config, not a hardcode');
});

test('every ollama.embed(...) call in the indexer embedder passes keep_alive', () => {
	// Each `ollama.embed({ ... })` call object must contain a keep_alive key.
	const callRe = /ollama\.embed\(\{([\s\S]*?)\}\)/g;
	const calls = [...SRC.matchAll(callRe)];
	assert.ok(calls.length >= 3, `expected >=3 ollama.embed calls (embedEntities/embedQuery/embedText), found ${calls.length}`);
	for (const m of calls) {
		assert.match(m[1]!, /keep_alive\s*:/, `an ollama.embed(...) call is missing keep_alive:\n${m[0]}`);
	}
});

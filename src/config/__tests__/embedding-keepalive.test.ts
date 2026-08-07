/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * S001 (embedding keep-alive) — the config-catalog registration + reconcile
 * carry-forward + the empty->default coalesce helper. Pure/in-memory; no real
 * config.json, no live Ollama.
 *
 * Run: npx tsx --test src/config/__tests__/embedding-keepalive.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CONFIG_CATALOG } from '../config-catalog.js';
import { reconcileConfig } from '../reconcile.js';
import { resolveEmbeddingKeepAlive } from '../local.js';

const PATH = 'models.local.embeddingKeepAlive';

function get(obj: unknown, dotted: string): unknown {
	return dotted.split('.').reduce<unknown>((acc, k) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[k] : undefined), obj);
}

test('config-catalog registers models.local.embeddingKeepAlive (type string, default 24h)', () => {
	const entry = CONFIG_CATALOG.find(e => e.path === PATH);
	assert.ok(entry, 'catalog entry must exist');
	assert.equal(entry!.type, 'string');
	assert.equal(entry!.default, '24h');
});

test('reconcile backfills the default into a config lacking the key, and preserves an operator override', () => {
	// absent -> filled with the catalog default
	const filled = reconcileConfig({});
	assert.equal(get(filled.config, PATH), '24h');

	// operator-set value is preserved (not clobbered)
	const custom = reconcileConfig({ models: { local: { embeddingKeepAlive: '-1' } } });
	assert.equal(get(custom.config, PATH), '-1');
});

test('resolveEmbeddingKeepAlive coalesces empty/blank/non-string to 24h; passes real values through', () => {
	assert.equal(resolveEmbeddingKeepAlive(''), '24h');
	assert.equal(resolveEmbeddingKeepAlive('   '), '24h');
	assert.equal(resolveEmbeddingKeepAlive(undefined), '24h');
	assert.equal(resolveEmbeddingKeepAlive(123), '24h');
	assert.equal(resolveEmbeddingKeepAlive('30m'), '30m');
	assert.equal(resolveEmbeddingKeepAlive(' -1 '), '-1');
	assert.equal(resolveEmbeddingKeepAlive('0'), '0');
});

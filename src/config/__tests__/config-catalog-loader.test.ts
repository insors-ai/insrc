/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for loadBuiltCatalog (t10) — the stale-catalog resolution helper.
 *
 * Run: npx tsx --test src/config/__tests__/config-catalog-loader.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadBuiltCatalog } from '../config-catalog-loader.js';
import { CONFIG_CATALOG } from '../config-catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

test('loadBuiltCatalog returns the FRESHLY imported catalog, not the static src/cli binding', async () => {
	const cat = await loadBuiltCatalog(join(FIXTURES, 'built-catalog-valid.mjs'));
	assert.ok(cat !== null);
	// Proof it is the freshly imported module: it carries `freshKey`, which the
	// statically-imported catalog does not, and is a different array instance.
	assert.ok(cat!.some(r => r.path === 'freshKey'));
	assert.notEqual(cat, CONFIG_CATALOG);
});

test('a missing / moved build output resolves to null without throwing', async () => {
	const cat = await loadBuiltCatalog(join(FIXTURES, 'does-not-exist.mjs'));
	assert.equal(cat, null);
});

test('an empty catalog module resolves to null (validation: non-empty array of rows)', async () => {
	const cat = await loadBuiltCatalog(join(FIXTURES, 'built-catalog-empty.mjs'));
	assert.equal(cat, null);
});

test('a malformed catalog module (CONFIG_CATALOG not an array of rows) resolves to null', async () => {
	const cat = await loadBuiltCatalog(join(FIXTURES, 'built-catalog-malformed.mjs'));
	assert.equal(cat, null);
});

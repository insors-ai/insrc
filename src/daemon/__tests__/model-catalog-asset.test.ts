/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story E20261016ab934d09:S001 — the shipped cloud model catalog lists the GPT-6 Codex models
 * the installer's Codex choice writes as its tiers.
 *
 * Run: npx tsx --test src/daemon/__tests__/model-catalog-asset.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { MODEL_CATALOG_DIR } from '../model-catalog.js';

test('src/daemon/__tests__/model-catalog-asset.test.ts: the shipped cloud model catalog lists the three GPT-6 Codex models', () => {
	const file = JSON.parse(readFileSync(join(MODEL_CATALOG_DIR, 'cloud-model-catalog.json'), 'utf8')) as {
		providers: Record<string, { id: string; displayName: string }[]>;
	};
	assert.deepEqual(
		file.providers['cli-codex']!.map(m => m.id),
		['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna'],
	);
	assert.deepEqual(
		file.providers['cli-codex']!.map(m => m.displayName),
		['GPT-6 Astra', 'GPT-6.1 Sol', 'GPT-6 Luna'],
	);
	// The Claude list already carries a haiku model for the cheap tier.
	assert.ok(file.providers['cli-claude']!.some(m => /haiku/.test(m.id)));
});

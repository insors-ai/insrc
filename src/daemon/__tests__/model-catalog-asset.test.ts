/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Contract test for the shipped model definitions file (Epic ce99b72065d03b1b,
 * Story s1 · t1): it validates, ships via copy-assets, lists every model and
 * alias today's defaults use, and its tier defaults and summariser models equal
 * DEFAULT_TIERS, the installer's Codex block and SUMMARISER_CLI_FALLBACK.
 *
 * Run: npx tsx --test src/daemon/__tests__/model-catalog-asset.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_TIERS } from '../../config/analyze.js';
import {
	MODEL_CATALOG_DIR,
	validateModelCatalog,
	_resetModelCatalogForTests,
	type FamilyDefinition,
} from '../model-catalog.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

afterEach(() => { _resetModelCatalogForTests(); });

function family(id: string): FamilyDefinition {
	const f = validateModelCatalog().families.find(x => x.id === id);
	assert.ok(f, `family ${id} present`);
	return f;
}

test('model-catalog-asset.test.ts: shipped asset validates, ships via copy-assets, lists today\'s models and aliases, and its tier defaults and summariser models equal DEFAULT_TIERS, the installer Codex block and SUMMARISER_CLI_FALLBACK', () => {
	// Validates (no override, no env seam -> the shipped asset).
	assert.equal(process.env['INSRC_MODEL_CATALOG_DIR'], undefined);
	const file = validateModelCatalog();
	assert.equal(file.defaultFamily, 'cli-claude');
	assert.deepEqual(file.families.map(f => f.id), ['cli-claude', 'cli-codex', 'ollama']);

	// Ships via copy-assets: the file lives under src/assets/, which copy-assets copies whole to out/assets/.
	assert.equal(relative(join(repoRoot, 'src'), MODEL_CATALOG_DIR).split(/[\\/]/).join('/'), 'assets/models');
	assert.match(readFileSync(join(repoRoot, 'copy-assets.mjs'), 'utf8'), /const DIRS = \[[^\]]*'assets'/);

	// Today's models and aliases.
	const claude = family('cli-claude');
	const codex  = family('cli-codex');
	const ollama = family('ollama');
	const byAlias = (f: FamilyDefinition, alias: string): string | undefined =>
		f.models.find(m => (m.aliases ?? []).includes(alias))?.id;
	assert.equal(byAlias(claude, 'opus'),   'claude-opus-5-5');
	assert.equal(byAlias(claude, 'sonnet'), 'claude-sonnet-5');
	assert.equal(byAlias(claude, 'haiku'),  'claude-haiku-5-5');
	for (const id of ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna']) {
		assert.ok(codex.models.some(m => m.id === id), `${id} listed`);
	}
	const qwen = ollama.models.find(m => m.id === 'qwen3.6:27b');
	assert.deepEqual(qwen?.inputLimit, { unit: 'tokens', max: 32768 });
	assert.equal(ollama.toolLoopModel, 'qwen3.6:27b');

	// Tier defaults equal DEFAULT_TIERS (cli-claude) and the installer's Codex block.
	for (const tier of ['core', 'mid', 'cheap'] as const) {
		assert.equal(DEFAULT_TIERS[tier].runner, 'cli-claude');
		assert.deepEqual(claude.tierDefaults?.[tier], { model: DEFAULT_TIERS[tier].model });
	}
	const installer = readFileSync(join(repoRoot, 'scripts', 'insrc-daemon-install.sh'), 'utf8');
	for (const tier of ['core', 'mid', 'cheap'] as const) {
		const m = new RegExp(`"${tier}":\\s*\\{\\s*"runner":\\s*"cli-codex",\\s*"model":\\s*"([^"]+)"`).exec(installer);
		assert.ok(m, `installer Codex block has ${tier}`);
		assert.deepEqual(codex.tierDefaults?.[tier], { model: m[1] });
	}

	// The summariser models the former SUMMARISER_CLI_FALLBACK named; the provider
	// factory now takes them from the file (Epic ce99b720 s3, provider-from-registry.test.ts).
	assert.equal(claude.summariserModel, 'haiku');
	assert.equal(codex.summariserModel, 'gpt-6-luna');
	const shaper = readFileSync(join(repoRoot, 'src', 'analyze', 'context', 'shaper-provider.ts'), 'utf8');
	assert.doesNotMatch(shaper, /SUMMARISER_CLI_FALLBACK/);
});

test('model-catalog-asset.test.ts: Codex models carry the 1048576-char inputLimit', () => {
	const codex = family('cli-codex');
	assert.ok(codex.models.length > 0);
	for (const m of codex.models) {
		assert.deepEqual(m.inputLimit, { unit: 'chars', max: 1_048_576 }, m.id);
	}
});

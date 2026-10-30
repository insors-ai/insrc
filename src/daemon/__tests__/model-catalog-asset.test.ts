/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Contract test for the shipped model definitions file (Epic ce99b72065d03b1b,
 * Story s1 · t1): it validates, ships via copy-assets, lists every model and
 * alias today's defaults use, and its tier defaults equal SHIPPED_MODEL_DEFAULTS. Since
 * s3 the installer reads its defaults from this file and the summariser comes
 * from each family's summariserModel.
 *
 * Run: npx tsx --test src/daemon/__tests__/model-catalog-asset.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assembleConfig } from '../../config/analyze.js';
import { SHIPPED_MODEL_DEFAULTS } from '../../config/model-defaults.js';
import { buildSummariserProvider } from '../../analyze/context/shaper-provider.js';
import { buildModelRegistry } from '../model-registry.js';
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

test('model-catalog-asset.test.ts: shipped asset validates, ships via copy-assets, lists today\'s models and aliases; its tier defaults equal DEFAULT_TIERS; the installer reads its defaults from the file; the summariser comes from summariserModel', () => {
	// Validates (no override, no env seam -> the shipped asset).
	assert.equal(process.env['INSRC_MODEL_CATALOG_DIR'], undefined);
	const file = validateModelCatalog();
	assert.equal(file.defaultFamily, 'cli-claude');
	assert.deepEqual(file.families.map(f => f.id), ['cli-claude', 'cli-codex', 'cli-vibe', 'ollama', 'ollama-claude']);

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
	const qwen38 = ollama.models.find(m => m.id === 'qwen3.8:27b');
	assert.deepEqual([qwen38?.efforts, qwen38?.inputLimit], [[], { unit: 'tokens', max: 32768 }], 'qwen3.8:27b listed with the local context window');

	// Tier defaults equal SHIPPED_MODEL_DEFAULTS (cli-claude) and the installer's Codex block.
	for (const tier of ['core', 'mid', 'cheap'] as const) {
		assert.equal(SHIPPED_MODEL_DEFAULTS.tiers[tier].runner, 'cli-claude');
		assert.deepEqual(claude.tierDefaults?.[tier], { model: SHIPPED_MODEL_DEFAULTS.tiers[tier].model });
	}
	// The installer reads the tier defaults and the tool-loop model from this file (installer-defs.test.ts runs it).
	const installer = readFileSync(join(repoRoot, 'scripts', 'insrc-daemon-install.sh'), 'utf8');
	assert.match(installer, /src\/assets\/models\/cloud-model-catalog\.json/);
	for (const tier of ['core', 'mid', 'cheap'] as const) {
		assert.equal(installer.includes(`"${codex.tierDefaults![tier].model}"`), false, `no ${tier} Codex literal in the installer`);
	}

	// The summariser: a CLI family's summariser model is the file's summariserModel.
	const registry = buildModelRegistry(validateModelCatalog(), []);
	assert.equal(registry.summariserModel('cli-claude').id, claude.models.find(m => m.id === claude.summariserModel || (m.aliases ?? []).includes(claude.summariserModel!))!.id);
	assert.equal(registry.summariserModel('cli-codex').id, codex.summariserModel);
	const cfg = assembleConfig({ tiers: { cheap: { runner: 'cli-codex', model: 'not-a-codex-model' } } }, { maxToolTurns: 1, structuredOutputRetries: 1, ollamaNumPredict: 1 }, { XS: 1, S: 1, M: 1, L: 1, XL: 1 }, registry);
	const summariser = buildSummariserProvider({ ...cfg, summariserProvider: 'cli-codex', summariserModel: 'not-a-codex-model' }, { registry }) as unknown as { defaultModel?: string };
	assert.equal(summariser.defaultModel, codex.summariserModel);
});

test('model-catalog-asset.test.ts: Codex models carry the 1048576-char inputLimit', () => {
	const codex = family('cli-codex');
	assert.ok(codex.models.length > 0);
	for (const m of codex.models) {
		assert.deepEqual(m.inputLimit, { unit: 'chars', max: 1_048_576 }, m.id);
	}
});

test('model-catalog-asset.test.ts: every shipped Ollama model has memoryMb and the build gate passes', async () => {
	const ollama = validateModelCatalog().families.find(f => f.id === 'ollama')!;
	assert.ok(ollama.models.length > 0);
	for (const m of ollama.models) assert.ok(Number.isInteger(m.memoryMb) && m.memoryMb! > 0, `${m.id} has memoryMb`);
	const { spawnSync } = await import('node:child_process');
	// The gate against the current source validator (the built out/ module may be stale).
	const r = spawnSync(process.execPath, ['--import', 'tsx', join(repoRoot, 'scripts', 'check-model-definitions.mjs'), '--module', join(repoRoot, 'src', 'daemon', 'model-catalog.ts')], { cwd: repoRoot, encoding: 'utf8', timeout: 60_000 });
	assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
});

test("model-catalog-asset.test.ts: the shipped file validates, lists ollama-claude after the existing families, and every host-family model has hosting 'cloud' with its efforts", () => {
	const ids = validateModelCatalog().families.map(f => f.id);
	assert.equal(ids.at(-1), 'ollama-claude', 'appended after the existing families');
	const host = family('ollama-claude');
	assert.deepEqual([host.cliKind, host.host, host.tierDefaults, host.summariserModel], ['claude', 'ollama', undefined, undefined]);
	const three = ['low', 'high', 'max'];
	assert.deepEqual(host.models.map(m => [m.id, m.hosting, m.efforts]), [
		['deepseek-v4-pro:cloud', 'cloud', []],
		['deepseek-v4.1-flash:cloud', 'cloud', three],
		['glm-5.3:cloud', 'cloud', three],
		['glm-5.3-flash:cloud', 'cloud', three],
		['mistral-large-4:cloud', 'cloud', []],
		['kimi-k3:cloud', 'cloud', three],
	]);
	// The installer takes the first family per CLI kind: still the vendor claude family.
	assert.equal(validateModelCatalog().families.find(f => f.cliKind === 'claude')!.id, 'cli-claude');
});

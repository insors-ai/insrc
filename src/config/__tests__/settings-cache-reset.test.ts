/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Settings read before the boot reconcile are dropped after it (Epic
 * ce99b72065d03b1b, Story s3 · t2): a local and an analyze config cached
 * before the reconcile return the reconciled values once main()'s production
 * resets run, and main() runs them right after the reconcile.
 *
 * HOME points at a temp dir before any module resolves ~/.insrc.
 *
 * Run: npx tsx --test src/config/__tests__/settings-cache-reset.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ModelDefinitionsFile } from '../../daemon/model-catalog.js';

const home = mkdtempSync(join(tmpdir(), 'settings-cache-reset-'));
process.env['HOME'] = home;
const { PATHS } = await import('../../shared/paths.js');
const { buildConfigCatalog } = await import('../config-catalog.js');
const { reconcileConfigFile } = await import('../reconcile-io.js');
const { loadLocalProviderConfig, resetLocalProviderConfigCache } = await import('../local.js');
const { loadAnalyzeConfig, resetAnalyzeConfigCache } = await import('../analyze.js');
const { _setModelCatalogDirForTests } = await import('../../daemon/model-catalog.js');
const { _resetModelRegistryForTests } = await import('../../daemon/model-registry.js');

/** Alternate definitions whose defaults differ from the shipped file. */
const ALTERNATE: ModelDefinitionsFile = {
	version: 1,
	defaultFamily: 'cli-codex',
	families: [
		{ id: 'cli-claude', cliKind: 'claude', displayName: 'Claude', models: [{ id: 'claude-z', efforts: [] }], tierDefaults: { core: { model: 'claude-z' }, mid: { model: 'claude-z' }, cheap: { model: 'claude-z' } }, summariserModel: 'claude-z' },
		{ id: 'cli-codex', cliKind: 'codex', displayName: 'Codex', models: [{ id: 'gpt-x', efforts: ['low'] }], tierDefaults: { core: { model: 'gpt-x', effort: 'low' }, mid: { model: 'gpt-x' }, cheap: { model: 'gpt-x' } }, summariserModel: 'gpt-x' },
		{ id: 'ollama', displayName: 'Ollama', models: [{ id: 'llama:1b', efforts: [], inputLimit: { unit: 'tokens', max: 4096 } }], toolLoopModel: 'llama:1b' },
		{ id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama', models: [{ id: 'glm:cloud', efforts: ['low'], hosting: 'cloud' }] },
		{ id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe', models: [{ id: 'vibe-a', aliases: ['va'], efforts: ['low', 'max'] }], tierDefaults: { core: { model: 'va' }, mid: { model: 'vibe-a' }, cheap: { model: 'vibe-a' } }, summariserModel: 'vibe-a' }
	],
};

test('settings-cache-reset.test.ts: a local and an analyze config cached before reconcile return the reconciled values after the production resets', () => {
	try {
		mkdirSync(dirname(PATHS.config), { recursive: true });
		// A core tier with no effort: the reconcile fills the definitions' default effort.
		writeFileSync(PATHS.config, JSON.stringify({ models: { tiers: { core: { runner: 'cli-codex', model: 'gpt-x' } } } }));
		// The daemon validated these definitions at boot; tiers resolve through them.
		const assets = join(home, 'assets');
		mkdirSync(assets);
		writeFileSync(join(assets, 'cloud-model-catalog.json'), JSON.stringify(ALTERNATE));
		_setModelCatalogDirForTests(assets);
		_resetModelRegistryForTests();

		// Read (and cached) before the reconcile: the shipped defaults.
		const before = loadLocalProviderConfig();
		const analyzeBefore = loadAnalyzeConfig();
		assert.notEqual(before.coreModel, 'llama:1b');
		assert.equal(analyzeBefore.shaperEffort, undefined);

		const outcome = reconcileConfigFile({ catalog: buildConfigCatalog(ALTERNATE) });
		assert.equal(outcome.kind, 'written');

		// Still the cached values until the resets run ...
		assert.equal(loadLocalProviderConfig().coreModel, before.coreModel);
		assert.equal(loadAnalyzeConfig().shaperEffort, undefined);

		// ... then the reconciled file.
		resetLocalProviderConfigCache();
		resetAnalyzeConfigCache();
		assert.equal(loadLocalProviderConfig().coreModel, 'llama:1b');
		const analyze = loadAnalyzeConfig();
		assert.equal(analyze.shaperProvider, 'cli-codex');
		assert.equal(analyze.shaperModel, 'gpt-x');
		assert.equal(analyze.shaperEffort, 'low');
	} finally {
		_setModelCatalogDirForTests(undefined);
		_resetModelRegistryForTests();
		rmSync(home, { recursive: true, force: true });
	}

	// main() resets both caches right after the boot reconcile, before any worker starts.
	const index = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'daemon', 'index.ts'), 'utf8');
	const reconcileAt = index.indexOf('reconcileConfigFile({ catalog: buildConfigCatalog(');
	const localAt = index.indexOf('resetLocalProviderConfigCache();');
	const analyzeAt = index.indexOf('resetAnalyzeConfigCache();');
	const workersAt = index.indexOf('supervisor = workers');
	assert.ok(reconcileAt > 0 && localAt > reconcileAt && analyzeAt > reconcileAt, 'the resets follow the reconcile');
	assert.ok(workersAt > 0 && localAt < workersAt && analyzeAt < workersAt, 'and precede the workers');
});

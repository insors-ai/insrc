/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Tier resolution through the model registry (Epic ce99b72065d03b1b, Story
 * s3 · t3). The registry is built over a fixture definitions file and a temp
 * approved-model store (one approved and one rejected Codex model); warnings
 * are read from the config:analyze logger.
 *
 * Run: npx tsx --test src/config/__tests__/tier-resolution.test.ts
 */

import { test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { assembleConfig, parseTiering, resolveTier } from '../analyze.js';
import { getLogger } from '../../shared/logger.js';
import { _setModelCatalogDirForTests } from '../../daemon/model-catalog.js';
import { getModelRegistry, _resetModelRegistryForTests, _setApprovedModelsPathForTests } from '../../daemon/model-registry.js';

const SHAPER = { maxToolTurns: 40, structuredOutputRetries: 3, ollamaNumCtx: 32768, ollamaNumPredict: 20480 };
const DEPTH  = { XS: 2, S: 3, M: 4, L: 5, XL: 6 };

/** Definitions whose default family is Codex with non-empty default efforts. */
function fixture(): Record<string, unknown> {
	return {
		version: 1,
		defaultFamily: 'cli-codex',
		families: [
			{
				id: 'cli-claude', cliKind: 'claude', displayName: 'Claude',
				models: [{ id: 'claude-big-1', aliases: ['big'], efforts: ['low', 'high'] }, { id: 'claude-small-1', aliases: ['small'], efforts: [] }],
				tierDefaults: { core: { model: 'big', effort: 'high' }, mid: { model: 'big' }, cheap: { model: 'small' } },
				summariserModel: 'small',
			},
			{
				id: 'cli-codex', cliKind: 'codex', displayName: 'Codex',
				models: [{ id: 'gpt-x', aliases: ['x'], efforts: ['low', 'turbo'] }, { id: 'gpt-y', efforts: ['low'] }],
				tierDefaults: { core: { model: 'x', effort: 'turbo' }, mid: { model: 'gpt-y', effort: 'low' }, cheap: { model: 'gpt-y' } },
				summariserModel: 'gpt-y',
			},
			{ id: 'ollama', displayName: 'Ollama', models: [{ id: 'llama:1b', efforts: [], inputLimit: { unit: 'tokens', max: 4096 } }], toolLoopModel: 'llama:1b' },
			{ id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama', models: [{ id: 'glm:cloud', efforts: ['low'], hosting: 'cloud' }] },
			{ id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe', models: [{ id: 'vibe-a', aliases: ['va'], efforts: ['low', 'max'] }], tierDefaults: { core: { model: 'va' }, mid: { model: 'vibe-a' }, cheap: { model: 'vibe-a' } }, summariserModel: 'vibe-a' }
		],
	};
}

const tmpDirs: string[] = [];
function useFixture(): void {
	const assets = mkdtempSync(join(tmpdir(), 'tier-res-'));
	tmpDirs.push(assets);
	writeFileSync(join(assets, 'cloud-model-catalog.json'), JSON.stringify(fixture()));
	const store = join(assets, 'approved-models.json');
	writeFileSync(store, JSON.stringify({ version: 1, profiles: [
		{ family: 'cli-codex', modelId: 'gpt-new', status: 'approved', efforts: ['low'], decidedAt: '2026-10-01T00:00:00Z', cliVersion: '0.164.0' },
		{ family: 'cli-codex', modelId: 'gpt-gone', status: 'rejected', efforts: [], decidedAt: '2026-10-01T00:00:00Z', cliVersion: '0.164.0' },
	] }));
	_setModelCatalogDirForTests(assets);
	_setApprovedModelsPathForTests(store);
	_resetModelRegistryForTests();
}

/** The config:analyze warnings logged while `fn` runs: [fields, message]. */
function warnings(fn: () => void): Array<[Record<string, unknown>, string]> {
	const log = getLogger('config:analyze');
	const spy = mock.method(log, 'warn', () => undefined);
	try { fn(); } finally { spy.mock.restore(); }
	return spy.mock.calls.map(c => [c.arguments[0] as Record<string, unknown>, String(c.arguments[1])]);
}

afterEach(() => {
	_setModelCatalogDirForTests(undefined);
	_setApprovedModelsPathForTests(undefined);
	_resetModelRegistryForTests();
	for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("tier-resolution.test.ts: unset and '' tiers resolve to the fixture default with its effort; '' effort is the CLI default; aliases resolve to canonical ids", () => {
	useFixture();
	const registry = getModelRegistry();

	// Unset: the default family's tier defaults, with their efforts, as canonical ids.
	const unset = assembleConfig({}, SHAPER, DEPTH, registry);
	assert.deepEqual(unset.tiering.tiers, {
		core:  { runner: 'cli-codex', model: 'gpt-x', effort: 'turbo' },
		mid:   { runner: 'cli-codex', model: 'gpt-y', effort: 'low' },
		cheap: { runner: 'cli-codex', model: 'gpt-y' },
	});
	assert.equal(unset.shaperEffort, 'turbo');
	assert.equal(unset.shaperProviderExplicit, false);

	// A '' model is unset too (whatever runner the entry names); a configured effort wins over the default's.
	const blank = parseTiering({ tiers: { core: { runner: 'cli-claude', model: '' }, mid: { runner: 'cli-codex', model: '', effort: 'turbo' } } });
	assert.equal(blank.tiers, undefined);
	assert.deepEqual(resolveTier(blank, 'core', registry), { runner: 'cli-codex', model: 'gpt-x', effort: 'turbo' });
	assert.equal(resolveTier(blank, 'mid', registry).effort, undefined, "gpt-y does not accept 'turbo': dropped");

	// '' effort asks for the CLI's own default, also over a default that has one.
	const cliDefault = parseTiering({ tiers: { core: { runner: 'cli-codex', model: '', effort: '' } } });
	assert.deepEqual(resolveTier(cliDefault, 'core', registry), { runner: 'cli-codex', model: 'gpt-x' });

	// Aliases resolve to the canonical id, in either family; the explicit tier keeps its effort.
	const aliased = parseTiering({ tiers: { core: { runner: 'cli-claude', model: 'big', effort: 'low' }, cheap: { runner: 'cli-codex', model: 'x' } } });
	const cfg = assembleConfig(aliased, SHAPER, DEPTH, registry);
	assert.deepEqual(cfg.tiering.tiers.core, { runner: 'cli-claude', model: 'claude-big-1', effort: 'low' });
	assert.deepEqual(cfg.tiering.tiers.cheap, { runner: 'cli-codex', model: 'gpt-x' }, 'an explicit model runs without the default effort');
	assert.equal(cfg.shaperModel, 'claude-big-1');
	assert.equal(cfg.summariserModel, 'gpt-x');
	assert.equal(cfg.tierResolutions.core.model.id, 'claude-big-1');

	// A user-approved model resolves like a shipped one.
	assert.deepEqual(resolveTier(parseTiering({ tiers: { mid: { runner: 'cli-codex', model: 'gpt-new', effort: 'low' } } }), 'mid', registry), { runner: 'cli-codex', model: 'gpt-new', effort: 'low' });
});

test('tier-resolution.test.ts: an unaccepted effort is dropped with a warning naming tier, model and effort', () => {
	useFixture();
	const registry = getModelRegistry();
	let cfg: ReturnType<typeof assembleConfig> | undefined;
	const logged = warnings(() => {
		cfg = assembleConfig(parseTiering({ tiers: {
			core:  { runner: 'cli-claude', model: 'small', effort: 'high' },
			cheap: { runner: 'ollama', model: 'llama:1b', effort: 'low' },
		} }), SHAPER, DEPTH, registry);
	});
	assert.deepEqual(cfg!.tiering.tiers.core, { runner: 'cli-claude', model: 'claude-small-1' }, 'no effort reaches the tier');
	assert.equal(cfg!.shaperEffort, undefined);
	assert.equal(cfg!.tierResolutions.core.droppedEffort, 'high');
	assert.equal(cfg!.tierResolutions.cheap.droppedEffort, 'low');
	const dropped = logged.filter(([f]) => f['effort'] !== undefined);
	assert.deepEqual(dropped.map(([f]) => f), [
		{ tier: 'core',  model: 'claude-small-1', effort: 'high' },
		{ tier: 'cheap', model: 'llama:1b',       effort: 'low' },
	]);
	assert.match(dropped[0]![1], /models\.tiers\.core: model claude-small-1 does not accept effort 'high'/);
});

test('tier-resolution.test.ts: unlisted and rejected models fall back with a warning naming tier, requested model, reason and default, kept in tierResolutions', () => {
	useFixture();
	const registry = getModelRegistry();
	let cfg: ReturnType<typeof assembleConfig> | undefined;
	const logged = warnings(() => {
		cfg = assembleConfig(parseTiering({ tiers: {
			core:  { runner: 'cli-codex', model: 'gpt-gone' },
			mid:   { runner: 'cli-claude', model: 'claude-retired' },
			cheap: { runner: 'ollama', model: 'qwen:unlisted' },
		} }), SHAPER, DEPTH, registry);
	});
	const r = cfg!.tierResolutions;
	assert.deepEqual(r.core.fallback, { reason: 'rejected-model', requested: 'gpt-gone' });
	assert.deepEqual([r.core.family, r.core.model.id, r.core.effort], ['cli-codex', 'gpt-x', 'turbo'], "the family's tier default with its effort");
	assert.deepEqual(r.mid.fallback, { reason: 'unlisted-model', requested: 'claude-retired' });
	assert.deepEqual([r.mid.family, r.mid.model.id], ['cli-claude', 'claude-big-1']);
	assert.deepEqual(r.cheap.fallback, { reason: 'unlisted-model', requested: 'qwen:unlisted' });
	assert.deepEqual([r.cheap.family, r.cheap.model.id], ['cli-codex', 'gpt-y'], 'an unlisted Ollama model falls back to the default family');
	assert.deepEqual(cfg!.tiering.tiers.core, { runner: 'cli-codex', model: 'gpt-x', effort: 'turbo' });

	const fallbacks = logged.filter(([f]) => f['requested'] !== undefined).map(([f]) => f);
	assert.deepEqual(fallbacks, [
		{ tier: 'core',  requested: 'gpt-gone',       reason: 'rejected-model', model: 'gpt-x' },
		{ tier: 'mid',   requested: 'claude-retired', reason: 'unlisted-model', model: 'claude-big-1' },
		{ tier: 'cheap', requested: 'qwen:unlisted',  reason: 'unlisted-model', model: 'gpt-y' },
	]);
});

test('tier-resolution.test.ts: a tier\'s own effort applies when no separate efforts entry exists; an efforts entry (\'\' included) wins', () => {
	useFixture();
	const registry = getModelRegistry();
	// A tiering built directly (not through parseTiering): only the tier carries the effort.
	assert.deepEqual(resolveTier({ tiers: { core: { runner: 'cli-codex', model: 'gpt-x', effort: 'turbo' } } }, 'core', registry), { runner: 'cli-codex', model: 'gpt-x', effort: 'turbo' });
	// An unaccepted effort carried on the tier still reaches the registry and is dropped with a warning.
	const logged = warnings(() => {
		const r = assembleConfig({ tiers: { core: { runner: 'cli-codex', model: 'gpt-y', effort: 'turbo' } } }, SHAPER, DEPTH, registry);
		assert.equal(r.tierResolutions.core.droppedEffort, 'turbo');
	});
	assert.ok(logged.some(([f]) => f['effort'] === 'turbo'));
	// The efforts entry wins, '' asking for the CLI default.
	assert.deepEqual(resolveTier({ tiers: { core: { runner: 'cli-codex', model: 'gpt-x', effort: 'turbo' } }, efforts: { core: '' } }, 'core', registry), { runner: 'cli-codex', model: 'gpt-x' });
});

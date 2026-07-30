/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the PURE reconcileConfig contract — the merge (fill / carry /
 * repair) AND the retired-key prune, driven through the injectable `catalog`
 * and `retired` parameters with in-memory fixtures.
 *
 * The pure-MERGE tests pass `retired: []` (via the `merge` helper) so they are
 * isolated from the built-in RETIRED_PATHS; the PRUNE tests pass explicit
 * retired lists. The one captured document proves both blind preservation and
 * blind pruning against the real RETIRED_PATHS.
 *
 * Run: npx tsx --test src/config/__tests__/config-reconcile.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CONFIG_CATALOG, RETIRED_PATHS, type ConfigOption, type RetiredPath } from '../config-catalog.js';
import { ConfigCatalogError, reconcileConfig, type ConfigReconcileResult } from '../reconcile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

function opt(path: string, type: ConfigOption['type'], def: unknown): ConfigOption {
	return { path, type, default: def, desc: '' };
}

/** Pure-merge helper: reconcile with NO retired list AND NO migrations,
 *  isolating the merge contract from RETIRED_PATHS + CONFIG_MIGRATIONS. */
function merge(existing: unknown, catalog: readonly ConfigOption[]): ConfigReconcileResult {
	return reconcileConfig(existing, catalog, [], []);
}

/** Pure-prune helper: reconcile with NO catalog AND NO migrations, isolating
 *  the prune contract from fills/repairs + CONFIG_MIGRATIONS. */
function prune(existing: unknown, retired: readonly RetiredPath[]): ConfigReconcileResult {
	return reconcileConfig(existing, [], retired, []);
}

/** Recursively freeze an object graph so any attempted mutation throws. */
function deepFreeze<T>(o: T): T {
	if (o !== null && typeof o === 'object') {
		for (const v of Object.values(o)) deepFreeze(v);
		Object.freeze(o);
	}
	return o;
}

function readFixture(name: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8')) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// classification: filled / carried / repaired  (pure merge, retired: [])
// ---------------------------------------------------------------------------

test('absent catalog key → default written, path in filled', () => {
	const r = merge({}, [opt('logLevel', 'enum', 'info')]);
	assert.deepEqual(r.filled, ['logLevel']);
	assert.equal(r.config['logLevel'], 'info');
	assert.deepEqual(r.carried, []);
	assert.deepEqual(r.repaired, []);
	assert.deepEqual(r.pruned, []);
	assert.equal(r.changed, true);
});

test('present + type-valid → carried unchanged; untouched subtrees referentially preserved', () => {
	const existing = { logLevel: 'debug', models: { analyze: { roleTiers: { a: 'core' } } } };
	const r = merge(existing, [opt('logLevel', 'enum', 'info')]);
	assert.deepEqual(r.carried, ['logLevel']);
	assert.deepEqual(r.filled, []);
	assert.equal(r.config['logLevel'], 'debug');
	assert.equal(r.config['models'], existing.models);   // same object reference
});

test('present + type-invalid → default substituted, path + discarded in repaired', () => {
	const existing = { models: { embeddingDim: '1024' } };
	const r = merge(existing, [opt('models.embeddingDim', 'number', 1024)]);
	assert.equal(r.repaired.length, 1);
	assert.equal(r.repaired[0]!.path, 'models.embeddingDim');
	assert.equal(r.repaired[0]!.discarded, '1024');
	assert.equal((r.config['models'] as Record<string, unknown>)['embeddingDim'], 1024);
});

test('falsy-but-valid values (false, 0, "") are carried, never filled (hasOwnProperty, not truthiness)', () => {
	const existing = { analyzer: { useLocal: false }, models: { embeddingDim: 0 }, routing: { mode: '' } };
	const cat = [
		opt('analyzer.useLocal', 'boolean', true),
		opt('models.embeddingDim', 'number', 1024),
		opt('routing.mode', 'string', 'static'),
	];
	const r = merge(existing, cat);
	assert.deepEqual(r.filled, []);
	assert.equal(r.carried.length, 3);
	assert.equal((r.config['analyzer'] as Record<string, unknown>)['useLocal'], false);
	assert.equal((r.config['models'] as Record<string, unknown>)['embeddingDim'], 0);
	assert.equal((r.config['routing'] as Record<string, unknown>)['mode'], '');
});

test('present array/object at a scalar row is detected as present (repaired), never filled', () => {
	const existing = { models: { tiers: { fast: [] as unknown } } };
	const r = merge(existing, [opt('models.tiers.fast', 'string', 'haiku')]);
	assert.deepEqual(r.filled, []);
	assert.equal(r.repaired.length, 1);
	assert.deepEqual(r.repaired[0]!.discarded, []);
});

test('null at a non-nullable declared type is repaired, not carried', () => {
	const r = merge({ logLevel: null }, [opt('logLevel', 'enum', 'info')]);
	assert.equal(r.repaired.length, 1);
	assert.equal(r.repaired[0]!.discarded, null);
	assert.equal(r.config['logLevel'], 'info');
});

test('type-matching object with extra un-enumerated sub-keys is carried whole, no recursion to prune', () => {
	const existing = { models: { analyze: { shaperProvider: 'ollama', roleTiers: { a: 'core', b: 'mid' } } } };
	const r = merge(existing, [opt('models.analyze.shaperProvider', 'enum', 'ollama')]);
	const roleTiers = ((r.config['models'] as Record<string, unknown>)['analyze'] as Record<string, unknown>)['roleTiers'];
	assert.deepEqual(roleTiers, { a: 'core', b: 'mid' });
});

test('catalog key reconciled beside a dynamic sibling at the same level — outcomes independent', () => {
	const existing = { models: { analyze: { shaperProvider: 12345 as unknown, roleTiers: { a: 'core' } } } };
	const r = merge(existing, [opt('models.analyze.shaperProvider', 'enum', 'ollama')]);
	const analyze = (r.config['models'] as Record<string, unknown>)['analyze'] as Record<string, unknown>;
	assert.equal(r.repaired[0]!.path, 'models.analyze.shaperProvider');
	assert.equal(analyze['shaperProvider'], 'ollama');
	assert.deepEqual(analyze['roleTiers'], { a: 'core' });
	assert.equal(analyze['roleTiers'], existing.models.analyze.roleTiers);   // same ref (shallow COW)
});

// ---------------------------------------------------------------------------
// ancestor-chain handling  (pure merge)
// ---------------------------------------------------------------------------

test('partially-present ancestor chain: intermediates synthesized, only the leaf in filled, siblings untouched', () => {
	const existing = { models: { tiers: { fast: 'x' } } };
	const r = merge(existing, [opt('models.tiers.standard', 'string', 'sonnet')]);
	assert.deepEqual(r.filled, ['models.tiers.standard']);
	const tiers = (r.config['models'] as Record<string, unknown>)['tiers'] as Record<string, unknown>;
	assert.equal(tiers['fast'], 'x');
	assert.equal(tiers['standard'], 'sonnet');
});

test('ancestor segment collides with a scalar: subtree replaced, CATALOG path recorded in repaired with the discarded scalar', () => {
	const existing = { models: { tiers: 'oops-a-string' } };
	const r = merge(existing, [opt('models.tiers.fast', 'string', 'haiku')]);
	assert.equal(r.repaired.length, 1);
	assert.equal(r.repaired[0]!.path, 'models.tiers.fast');
	assert.equal(r.repaired[0]!.discarded, 'oops-a-string');
	assert.equal(((r.config['models'] as Record<string, unknown>)['tiers'] as Record<string, unknown>)['fast'], 'haiku');
});

// ---------------------------------------------------------------------------
// invariants  (pure merge)
// ---------------------------------------------------------------------------

test('value already exactly equal to the catalog default → carried, not filled', () => {
	const r = merge({ logLevel: 'info' }, [opt('logLevel', 'enum', 'info')]);
	assert.deepEqual(r.carried, ['logLevel']);
	assert.deepEqual(r.filled, []);
});

test('changed === (filled + repaired + pruned > 0); changed false implies config deep-equals existing', () => {
	const existing = { logLevel: 'info', models: { agents: { x: 1 } } };
	const r = merge(existing, [opt('logLevel', 'enum', 'info')]);   // retired: [] → agents NOT pruned here
	assert.equal(r.changed, false);
	assert.deepEqual(r.config, existing);
});

test('non-object roots (undefined / null / array / string / number / boolean) → treated as {}, all keys filled', () => {
	for (const bad of [undefined, null, [], 'str', 42, true]) {
		const r = merge(bad, [opt('logLevel', 'enum', 'info')]);
		assert.deepEqual(r.filled, ['logLevel']);
		assert.equal(r.config['logLevel'], 'info');
	}
});

test('empty catalog + empty retired → changed false, config deep-equals existing', () => {
	const existing = { models: { agents: { x: 1 } }, logLevel: 'info' };
	const r = reconcileConfig(existing, [], []);
	assert.equal(r.changed, false);
	assert.deepEqual(r.config, existing);
});

// ---------------------------------------------------------------------------
// catalog-integrity failures throw ConfigCatalogError
// ---------------------------------------------------------------------------

test('catalog row with an out-of-domain type throws ConfigCatalogError naming the path', () => {
	assert.throws(
		() => reconcileConfig({}, [{ path: 'x.y', type: 'weird' as ConfigOption['type'], default: 'd', desc: '' }], []),
		(e: unknown) => e instanceof ConfigCatalogError && e.catalogPath === 'x.y',
	);
});

test('catalog row whose own default fails its own declared type throws ConfigCatalogError naming the path', () => {
	assert.throws(
		() => reconcileConfig({}, [opt('a.b', 'number', 'not-a-number')], []),
		(e: unknown) => e instanceof ConfigCatalogError && e.catalogPath === 'a.b',
	);
});

// ---------------------------------------------------------------------------
// PRUNE contract (explicit retired lists)
// ---------------------------------------------------------------------------

test('retired exact-path present → deleted, recorded in pruned[], changed true', () => {
	const r = prune({ models: { local: 'qwen', analyze: { coreFloor: 'mid' } } }, [{ path: 'models.local' }]);
	assert.deepEqual(r.pruned, ['models.local']);
	assert.equal(r.changed, true);
	assert.equal(Object.prototype.hasOwnProperty.call(r.config['models'] as object, 'local'), false);
	// sibling under the same parent survives
	assert.deepEqual((r.config['models'] as Record<string, unknown>)['analyze'], { coreFloor: 'mid' });
});

test('retired exact-path absent → no-op, not in pruned, does not set changed', () => {
	const r = prune({ models: { analyze: {} } }, [{ path: 'models.local' }]);
	assert.deepEqual(r.pruned, []);
	assert.equal(r.changed, false);
});

test('retired prefix root with populated subtree → whole subtree deleted, recorded ONCE as the prefix root', () => {
	const r = prune({ models: { tiers: { fast: 'a', standard: 'b', powerful: 'c' } } }, [{ path: 'models.tiers', prefix: true }]);
	assert.deepEqual(r.pruned, ['models.tiers']);   // ONE entry, not per sub-key
	assert.equal(Object.prototype.hasOwnProperty.call(r.config['models'] as object, 'tiers'), false);
});

test('retired prefix root present as a SCALAR → slot removed, recorded (type-agnostic delete)', () => {
	const r = prune({ models: { context: 'oops' } }, [{ path: 'models.context', prefix: true }]);
	assert.deepEqual(r.pruned, ['models.context']);
	assert.equal(Object.prototype.hasOwnProperty.call(r.config['models'] as object, 'context'), false);
});

test('retired exact-path with falsy-but-present value (0/""/false) → pruned via hasOwnProperty, not truthiness', () => {
	for (const falsy of [0, '', false]) {
		const r = prune({ models: { embeddingDim: falsy } }, [{ path: 'models.embeddingDim' }]);
		assert.deepEqual(r.pruned, ['models.embeddingDim'], `falsy ${JSON.stringify(falsy)} must still prune`);
	}
});

test('retired path with a MISSING ancestor → no-op, nothing recorded', () => {
	const r = prune({ logLevel: 'info' }, [{ path: 'models.local' }]);
	assert.deepEqual(r.pruned, []);
	assert.equal(r.changed, false);
	assert.deepEqual(r.config, { logLevel: 'info' });
});

test('un-catalogued key NOT on the retired list → preserved (blind-preservation refined)', () => {
	const existing = { models: { analyze: { roleTiers: { a: 'core' }, byRepo: { '/r': { coreFloor: 'core' } } }, providers: { local: { coreModel: 'qwen' } } }, orphan: 1 };
	const r = prune(existing, [{ path: 'models.local' }]);   // only models.local retired
	const analyze = (r.config['models'] as Record<string, unknown>)['analyze'] as Record<string, unknown>;
	assert.deepEqual(analyze['roleTiers'], { a: 'core' });
	assert.deepEqual(analyze['byRepo'], { '/r': { coreFloor: 'core' } });
	assert.deepEqual((r.config['models'] as Record<string, unknown>)['providers'], { local: { coreModel: 'qwen' } });
	assert.equal(r.config['orphan'], 1);
	assert.equal(r.changed, false);   // nothing to prune (models.local absent), nothing filled
});

test('idempotence with migrate + prune: reconcileConfig(reconcileConfig(x).config) is a no-op (real catalog + RETIRED_PATHS)', () => {
	const corpus: unknown[] = [
		{ models: { embedding: 'x', agents: { p: 1 }, analyze: { coreFloor: 'mid', roleTiers: { synthesize: 'mid' } } } },
		readFixture('legacy-config.json'),
	];
	for (const doc of corpus) {
		const once = reconcileConfig(doc, CONFIG_CATALOG, RETIRED_PATHS);
		const twice = reconcileConfig(once.config, CONFIG_CATALOG, RETIRED_PATHS);
		assert.deepEqual(twice.migrated, [], `second pass migrated nothing for ${JSON.stringify(doc).slice(0, 50)}`);
		assert.deepEqual(twice.pruned, [], `second pass pruned nothing for ${JSON.stringify(doc).slice(0, 50)}`);
		assert.equal(twice.changed, false);
	}
});

test('a retired path overlapping a live catalog row throws ConfigCatalogError naming the path', () => {
	// retired 'models.analyze' (prefix) overlaps the live models.analyze.coreFloor row.
	assert.throws(
		() => reconcileConfig({}, [opt('models.analyze.coreFloor', 'enum', 'mid')], [{ path: 'models.analyze', prefix: true }]),
		(e: unknown) => e instanceof ConfigCatalogError && e.catalogPath === 'models.analyze',
	);
	// exact overlap too
	assert.throws(
		() => reconcileConfig({}, [opt('models.local', 'string', 'x')], [{ path: 'models.local' }]),
		(e: unknown) => e instanceof ConfigCatalogError && e.catalogPath === 'models.local',
	);
});

test('existing document is never mutated — a deep-frozen input reconciles+prunes and deep-equals itself afterwards', () => {
	const snapshot = { models: { local: 'qwen', tiers: { fast: 'a' }, analyze: { roleTiers: { a: 'core' } } }, logLevel: 'debug' };
	const existing = deepFreeze(JSON.parse(JSON.stringify(snapshot)) as typeof snapshot);
	assert.doesNotThrow(() => reconcileConfig(existing, [opt('logLevel', 'enum', 'info')], [{ path: 'models.local' }, { path: 'models.tiers', prefix: true }]));
	assert.deepEqual(existing, snapshot);   // input unchanged
});

// ---------------------------------------------------------------------------
// captured document + the REAL catalog & RETIRED_PATHS
// ---------------------------------------------------------------------------

test('captured legacy config → migrated to the flat models.* surface, residue pruned, orphan survives', () => {
	const fixture  = readFixture('legacy-config.json');
	const baseline = readFixture('legacy-config.baseline.json');
	const r = reconcileConfig(fixture, CONFIG_CATALOG, RETIRED_PATHS);
	const models = r.config['models'] as Record<string, unknown>;
	// the old nesting + still-retired ancient leftovers are gone
	for (const k of ['analyze', 'providers', 'embedding', 'embeddingDim', 'agents']) {
		assert.equal(Object.prototype.hasOwnProperty.call(models, k), false, `models.${k} must be gone`);
	}
	// the flat surface is present and deep-equals the reconciled baseline
	const bModels = baseline['models'] as Record<string, unknown>;
	for (const k of ['tiers', 'tasks', 'coreFloor', 'byRepo', 'shaper', 'maxPlanDepth', 'local']) {
		assert.deepEqual(models[k], bModels[k], `models.${k} must match baseline`);
	}
	// the legacy per-repo shaper pin folded into tiers.core.runner; roleTiers→tasks
	assert.deepEqual(models['tasks'], { 'design.hld.synthesize': 'core', 'review.claims.enumerate': 'mid', 'tracker.render': 'cheap' });
	const byRepo = models['byRepo'] as Record<string, Record<string, unknown>>;
	assert.deepEqual(byRepo['/Users/redacted/work/projects/example/repo'], { coreFloor: 'core', tiers: { core: { runner: 'cli-claude' } } });
	// the top-level orphan key (not on the retired list) survives
	assert.equal(r.config['legacyOrphanKey'], 'kept-blindly');
	assert.equal(r.migrated.length, 7);
	assert.ok(r.pruned.length >= 5);
});

test('no user-config input produces a ConfigCatalogError against the real catalog + RETIRED_PATHS', () => {
	for (const doc of [{}, { models: { tiers: { fast: 42 }, agents: { x: 1 } } }, readFixture('legacy-config.json')]) {
		assert.doesNotThrow(() => reconcileConfig(doc, CONFIG_CATALOG, RETIRED_PATHS));
	}
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Unit tests for the PURE reconcileConfig contract (t5). Everything here is
 * driven through the injectable `catalog` parameter with in-memory fixtures —
 * the reconciler is pure, so no on-disk fixture is needed at this level (the
 * one captured document is used only to prove blind namespace preservation).
 *
 * Run: npx tsx --test src/config/__tests__/config-reconcile.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CONFIG_CATALOG, type ConfigOption } from '../config-catalog.js';
import { ConfigCatalogError, reconcileConfig } from '../reconcile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

function opt(path: string, type: ConfigOption['type'], def: unknown): ConfigOption {
	return { path, type, default: def, desc: '' };
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
// classification: filled / carried / repaired
// ---------------------------------------------------------------------------

test('absent catalog key → default written, path in filled', () => {
	const r = reconcileConfig({}, [opt('logLevel', 'enum', 'info')]);
	assert.deepEqual(r.filled, ['logLevel']);
	assert.equal(r.config['logLevel'], 'info');
	assert.deepEqual(r.carried, []);
	assert.deepEqual(r.repaired, []);
	assert.equal(r.changed, true);
});

test('present + type-valid → carried unchanged; untouched subtrees referentially preserved', () => {
	const existing = { logLevel: 'debug', models: { analyze: { roleTiers: { a: 'core' } } } };
	const r = reconcileConfig(existing, [opt('logLevel', 'enum', 'info')]);
	assert.deepEqual(r.carried, ['logLevel']);
	assert.deepEqual(r.filled, []);
	assert.equal(r.config['logLevel'], 'debug');
	// models was never touched → same object reference (not a deep clone)
	assert.equal(r.config['models'], existing.models);
});

test('present + type-invalid → default substituted, path + discarded in repaired', () => {
	const existing = { models: { embeddingDim: '1024' } };
	const r = reconcileConfig(existing, [opt('models.embeddingDim', 'number', 1024)]);
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
	const r = reconcileConfig(existing, cat);
	assert.deepEqual(r.filled, []);
	assert.equal(r.carried.length, 3);
	assert.equal((r.config['analyzer'] as Record<string, unknown>)['useLocal'], false);
	assert.equal((r.config['models'] as Record<string, unknown>)['embeddingDim'], 0);
	assert.equal((r.config['routing'] as Record<string, unknown>)['mode'], '');
});

test('present array/object at a scalar row is detected as present (repaired), never filled', () => {
	const existing = { models: { tiers: { fast: [] as unknown } } };
	const r = reconcileConfig(existing, [opt('models.tiers.fast', 'string', 'haiku')]);
	assert.deepEqual(r.filled, []);                 // present → not filled
	assert.equal(r.repaired.length, 1);             // wrong type → repaired
	assert.deepEqual(r.repaired[0]!.discarded, []);
});

test('null at a non-nullable declared type is repaired, not carried (typeof null === object must not slip through)', () => {
	const r = reconcileConfig({ logLevel: null }, [opt('logLevel', 'enum', 'info')]);
	assert.equal(r.repaired.length, 1);
	assert.equal(r.repaired[0]!.discarded, null);
	assert.equal(r.config['logLevel'], 'info');
});

// ---------------------------------------------------------------------------
// dynamic namespaces & un-enumerated subtrees survive blindly
// ---------------------------------------------------------------------------

test('type-matching object with extra un-enumerated sub-keys is carried whole, no recursion to prune', () => {
	const existing = { models: { analyze: { shaperProvider: 'ollama', roleTiers: { a: 'core', b: 'mid' } } } };
	const r = reconcileConfig(existing, [opt('models.analyze.shaperProvider', 'enum', 'ollama')]);
	const roleTiers = ((r.config['models'] as Record<string, unknown>)['analyze'] as Record<string, unknown>)['roleTiers'];
	assert.deepEqual(roleTiers, { a: 'core', b: 'mid' });
});

test('catalog key reconciled beside a dynamic sibling at the same level — outcomes independent', () => {
	const existing = { models: { analyze: { shaperProvider: 12345 as unknown, roleTiers: { a: 'core' } } } };
	const r = reconcileConfig(existing, [opt('models.analyze.shaperProvider', 'enum', 'ollama')]);
	const analyze = (r.config['models'] as Record<string, unknown>)['analyze'] as Record<string, unknown>;
	assert.equal(r.repaired[0]!.path, 'models.analyze.shaperProvider');
	assert.equal(analyze['shaperProvider'], 'ollama');                 // repaired
	assert.deepEqual(analyze['roleTiers'], { a: 'core' });             // sibling untouched
	assert.equal(analyze['roleTiers'], existing.models.analyze.roleTiers); // still the same ref (shallow COW)
});

test('captured document: all three dynamic namespaces survive deep-equal across a gained-and-lost catalog', () => {
	const fixture = readFixture('legacy-config.json');
	const baseline = readFixture('legacy-config.baseline.json');
	// A catalog that GAINED a row absent from the fixture (coreFloor) and LOST
	// rows the real catalog has (only two rows here) relative to the fixture.
	const gainedAndLost = [
		opt('models.analyze.coreFloor', 'enum', 'mid'),
		opt('logLevel', 'enum', 'info'),
	];
	const r = reconcileConfig(fixture, gainedAndLost);
	const analyze = (r.config['models'] as Record<string, unknown>)['analyze'] as Record<string, unknown>;
	const bAnalyze = (baseline['models'] as Record<string, unknown>)['analyze'] as Record<string, unknown>;
	assert.deepEqual(analyze['roleTiers'], bAnalyze['roleTiers']);
	assert.deepEqual(analyze['byRepo'], bAnalyze['byRepo']);
	assert.deepEqual((r.config['models'] as Record<string, unknown>)['agents'],
		(baseline['models'] as Record<string, unknown>)['agents']);
	// the gained key was filled; the orphan top-level key survived
	assert.ok(r.filled.includes('models.analyze.coreFloor'));
	assert.equal(r.config['legacyOrphanKey'], 'kept-blindly');
});

// ---------------------------------------------------------------------------
// ancestor-chain handling
// ---------------------------------------------------------------------------

test('partially-present ancestor chain: intermediates synthesized, only the leaf in filled, siblings untouched', () => {
	const existing = { models: { tiers: { fast: 'x' } } };
	const r = reconcileConfig(existing, [opt('models.tiers.standard', 'string', 'sonnet')]);
	assert.deepEqual(r.filled, ['models.tiers.standard']);
	const tiers = (r.config['models'] as Record<string, unknown>)['tiers'] as Record<string, unknown>;
	assert.equal(tiers['fast'], 'x');            // existing sibling untouched
	assert.equal(tiers['standard'], 'sonnet');
});

test('ancestor segment collides with a scalar: subtree replaced, CATALOG path recorded in repaired with the discarded scalar', () => {
	const existing = { models: { tiers: 'oops-a-string' } };
	const r = reconcileConfig(existing, [opt('models.tiers.fast', 'string', 'haiku')]);
	assert.equal(r.repaired.length, 1);
	assert.equal(r.repaired[0]!.path, 'models.tiers.fast');   // the CATALOG path, not the ancestor
	assert.equal(r.repaired[0]!.discarded, 'oops-a-string');  // the discarded scalar
	assert.equal(((r.config['models'] as Record<string, unknown>)['tiers'] as Record<string, unknown>)['fast'], 'haiku');
});

// ---------------------------------------------------------------------------
// invariants
// ---------------------------------------------------------------------------

test('value already exactly equal to the catalog default → carried, not filled', () => {
	const r = reconcileConfig({ logLevel: 'info' }, [opt('logLevel', 'enum', 'info')]);
	assert.deepEqual(r.carried, ['logLevel']);
	assert.deepEqual(r.filled, []);
});

test('changed === (filled.length + repaired.length > 0); changed false implies config deep-equals existing', () => {
	const existing = { logLevel: 'info', models: { agents: { x: 1 } } };
	const r = reconcileConfig(existing, [opt('logLevel', 'enum', 'info')]);
	assert.equal(r.changed, false);
	assert.deepEqual(r.config, existing);

	const r2 = reconcileConfig({}, [opt('logLevel', 'enum', 'info')]);
	assert.equal(r2.changed, r2.filled.length + r2.repaired.length > 0);
	assert.equal(r2.changed, true);
});

test('idempotence: reconcileConfig(reconcileConfig(x).config).changed === false across the corpus', () => {
	const corpus: unknown[] = [
		{},
		{ logLevel: 'info' },
		{ models: { embeddingDim: '1024' } },
		{ models: { tiers: 'not-an-object' } },
		readFixture('legacy-config.json'),
	];
	for (const doc of corpus) {
		const once = reconcileConfig(doc, CONFIG_CATALOG);
		const twice = reconcileConfig(once.config, CONFIG_CATALOG);
		assert.equal(twice.changed, false, `idempotence broke for ${JSON.stringify(doc).slice(0, 60)}`);
	}
});

test('non-object roots (undefined / null / array / string / number / boolean) → treated as {}, all keys filled, nothing thrown', () => {
	for (const bad of [undefined, null, [], 'str', 42, true]) {
		const r = reconcileConfig(bad, [opt('logLevel', 'enum', 'info')]);
		assert.deepEqual(r.filled, ['logLevel']);
		assert.equal(r.config['logLevel'], 'info');
	}
});

test('empty catalog / a catalog matching nothing → changed false, config deep-equals existing', () => {
	const existing = { models: { agents: { x: 1 } }, logLevel: 'info' };
	const r = reconcileConfig(existing, []);
	assert.equal(r.changed, false);
	assert.deepEqual(r.config, existing);
});

// ---------------------------------------------------------------------------
// catalog-integrity failures throw ConfigCatalogError (a shipped-catalog bug)
// ---------------------------------------------------------------------------

test('catalog row with an out-of-domain type throws ConfigCatalogError naming the path, never fill-default', () => {
	assert.throws(
		() => reconcileConfig({}, [{ path: 'x.y', type: 'weird' as ConfigOption['type'], default: 'd', desc: '' }]),
		(e: unknown) => e instanceof ConfigCatalogError && e.catalogPath === 'x.y',
	);
});

test('catalog row whose own default fails its own declared type throws ConfigCatalogError naming the path', () => {
	assert.throws(
		() => reconcileConfig({}, [opt('a.b', 'number', 'not-a-number')]),
		(e: unknown) => e instanceof ConfigCatalogError && e.catalogPath === 'a.b',
	);
});

test('no user-config input in the corpus produces a ConfigCatalogError against the real catalog', () => {
	for (const doc of [{}, { models: { tiers: 42 } }, readFixture('legacy-config.json')]) {
		assert.doesNotThrow(() => reconcileConfig(doc, CONFIG_CATALOG));
	}
});

// ---------------------------------------------------------------------------
// non-mutation
// ---------------------------------------------------------------------------

test('existing document is never mutated — a deep-frozen input reconciles and deep-equals itself afterwards', () => {
	const snapshot = { models: { tiers: { fast: 'x' }, analyze: { roleTiers: { a: 'core' } } }, logLevel: 'debug' };
	const existing = deepFreeze(JSON.parse(JSON.stringify(snapshot)) as typeof snapshot);
	assert.doesNotThrow(() => reconcileConfig(existing, [
		opt('models.tiers.standard', 'string', 'sonnet'),   // forces a write into a frozen subtree's parent
		opt('logLevel', 'enum', 'info'),
	]));
	assert.deepEqual(existing, snapshot);   // input unchanged
});

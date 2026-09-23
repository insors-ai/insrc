/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Curated cloud model catalog tests (Epic ba132c185fe45860, S001 · t4).
 *
 * The validator branches (pass / missing / non-JSON / schema-invalid) and the
 * modelsFor accessor (populated / provider-omitted / empty array) + the
 * boot-ordering guard are exercised against a TEMP asset dir via the shared
 * _setModelCatalogDirForTests override — no live daemon. The contract test runs
 * against the real resolved MODEL_CATALOG_DIR (src/assets/models under tsx;
 * out/assets/models when built) to prove the shipped asset validates + carries
 * a well-formed CloudModelCatalogFile (ac2/ac3). Mirrors
 * src/docgen/__tests__/asset-validator.test.ts.
 *
 * Run: npx tsx --test src/daemon/__tests__/model-catalog.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync, statSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	validateModelCatalog,
	getCuratedCatalog,
	ModelCatalogValidationError,
	MODEL_CATALOG_DIR,
	modelCatalogDir,
	_setModelCatalogDirForTests,
	_resetModelCatalogForTests,
	type CloudModelCatalogFile,
} from '../model-catalog.js';

const CATALOG_FILE = 'cloud-model-catalog.json';

const VALID: CloudModelCatalogFile = {
	version: 1,
	providers: {
		'cli-claude': [{ id: 'claude-opus-5-5', displayName: 'Claude Opus 5.5' }, { id: 'claude-sonnet-5' }],
		'cli-codex':  [{ id: 'gpt-5-codex', displayName: 'GPT-5 Codex' }],
	},
};

/** A temp asset dir; a null value means "don't write the catalog file". */
function tmpAssetDir(catalog: string | null): string {
	const dir = mkdtempSync(join(tmpdir(), 'model-catalog-'));
	if (catalog !== null) writeFileSync(join(dir, CATALOG_FILE), catalog);
	return dir;
}

afterEach(() => { _setModelCatalogDirForTests(undefined); _resetModelCatalogForTests(); });

// ── validator branches against a temp dir ───────────────────────────────────

test('validateModelCatalog: valid catalog fixture → resolves, caches the frozen parse', async () => {
	const dir = tmpAssetDir(JSON.stringify(VALID));
	_setModelCatalogDirForTests(dir);
	await assert.doesNotReject(() => validateModelCatalog());
	// cached → getCuratedCatalog serves it without re-reading disk.
	const models = getCuratedCatalog().modelsFor('cli-claude');
	assert.equal(models.length, 2);
	assert.equal(models[0]!.id, 'claude-opus-5-5');
	assert.throws(() => { (models as CatalogModelMut[]).push({ id: 'x' }); }, 'frozen array is immutable');
	rmSync(dir, { recursive: true, force: true });
});

test('validateModelCatalog: removed/absent catalog file → throws ModelCatalogValidationError naming the file + one copy-assets Fix: line', async () => {
	const dir = tmpAssetDir(null);
	_setModelCatalogDirForTests(dir);
	await assert.rejects(() => validateModelCatalog(), (e: unknown) => {
		assert.ok(e instanceof ModelCatalogValidationError);
		assert.equal(e.path, join(dir, CATALOG_FILE));
		assert.match(e.reason, /file not found/);
		assert.equal((e.message.match(/Fix:/g) ?? []).length, 1);
		assert.match(e.message, /copy-assets/);
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

test('validateModelCatalog: non-JSON file → throws (parse failure) naming the file', async () => {
	const dir = tmpAssetDir('{ not valid json');
	_setModelCatalogDirForTests(dir);
	await assert.rejects(() => validateModelCatalog(), (e: unknown) => {
		assert.ok(e instanceof ModelCatalogValidationError);
		assert.equal(e.path, join(dir, CATALOG_FILE));
		assert.match(e.reason, /malformed JSON/);
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

test('validateModelCatalog: schema-invalid variants → throw naming the specific failure, short-circuit', async () => {
	const cases: Array<[string, RegExp]> = [
		[JSON.stringify({ providers: VALID.providers }),                                    /missing or non-numeric `version`/],
		[JSON.stringify({ version: 1, providers: [] }),                                     /`providers` is not an object/],
		[JSON.stringify({ version: 1, providers: { 'cli-claude': {}, 'cli-codex': [] } }),  /`providers.cli-claude` is not an array/],
		[JSON.stringify({ version: 1, providers: { 'cli-claude': [{}], 'cli-codex': [] } }), /missing or non-string `id`/],
		[JSON.stringify({ version: 1, providers: { 'cli-claude': [{ id: 1 }], 'cli-codex': [] } }), /missing or non-string `id`/],
		[JSON.stringify({ version: 1, providers: { 'cli-claude': [{ id: 'a', displayName: 5 }], 'cli-codex': [] } }), /`displayName`.*is not a string/],
	];
	for (const [body, re] of cases) {
		const dir = tmpAssetDir(body);
		_setModelCatalogDirForTests(dir);
		await assert.rejects(() => validateModelCatalog(), (e: unknown) => {
			assert.ok(e instanceof ModelCatalogValidationError, `expected ModelCatalogValidationError for ${body}`);
			assert.match(e.reason, re);
			return true;
		});
		rmSync(dir, { recursive: true, force: true });
		_resetModelCatalogForTests();
	}
});

test('validateModelCatalog: short-circuits on the FIRST structural failure (version before providers)', async () => {
	// Two violations at once (bad version AND bad providers). Short-circuit means
	// the version check throws first, so providers is never reached.
	const dir = tmpAssetDir(JSON.stringify({ version: 'nope', providers: 42 }));
	_setModelCatalogDirForTests(dir);
	await assert.rejects(() => validateModelCatalog(), (e: unknown) => {
		assert.ok(e instanceof ModelCatalogValidationError);
		assert.match(e.reason, /missing or non-numeric `version`/);
		assert.doesNotMatch(e.reason, /providers/);   // never got to the providers check
		return true;
	});
	rmSync(dir, { recursive: true, force: true });
});

// ── modelsFor accessor cases ─────────────────────────────────────────────────

test("modelsFor('cli-claude') / modelsFor('cli-codex') over a loaded catalog → the curated readonly arrays", async () => {
	const dir = tmpAssetDir(JSON.stringify(VALID));
	_setModelCatalogDirForTests(dir);
	await validateModelCatalog();
	const cat = getCuratedCatalog();
	assert.deepEqual(cat.modelsFor('cli-claude').map(m => m.id), ['claude-opus-5-5', 'claude-sonnet-5']);
	assert.deepEqual(cat.modelsFor('cli-codex').map(m => m.id), ['gpt-5-codex']);
	// optional displayName preserved / absent
	assert.equal(cat.modelsFor('cli-claude')[0]!.displayName, 'Claude Opus 5.5');
	assert.equal(cat.modelsFor('cli-claude')[1]!.displayName, undefined);
	rmSync(dir, { recursive: true, force: true });
});

test('modelsFor for a provider with an explicitly-empty array → empty readonly array (not an error)', async () => {
	// providers object present but one provider's array is empty; validation still passes.
	const dir = tmpAssetDir(JSON.stringify({ version: 2, providers: { 'cli-claude': [{ id: 'a' }], 'cli-codex': [] } }));
	_setModelCatalogDirForTests(dir);
	await assert.doesNotReject(() => validateModelCatalog());
	assert.deepEqual(getCuratedCatalog().modelsFor('cli-codex'), []);
	rmSync(dir, { recursive: true, force: true });
});

test('getCuratedCatalog before validateModelCatalog populated the cache → throws the boot-ordering Error', () => {
	_resetModelCatalogForTests();
	assert.throws(() => getCuratedCatalog(), (e: unknown) => {
		assert.ok(e instanceof Error);
		assert.ok(!(e instanceof ModelCatalogValidationError), 'a boot-ordering bug, not a bad-catalog error');
		assert.match((e as Error).message, /before validateModelCatalog/);
		return true;
	});
});

// ── one-source-of-truth path invariant ───────────────────────────────────────

test('MODEL_CATALOG_DIR is the dir modelCatalogDir() resolves by default (one source of truth)', () => {
	assert.equal(modelCatalogDir(), MODEL_CATALOG_DIR);   // no override → the const
	assert.match(MODEL_CATALOG_DIR, /assets[\\/]models$/);
});

// ── contract: the real shipped catalog validates + is well-formed ────────────

test('contract: validateModelCatalog passes against the real resolved MODEL_CATALOG_DIR and modelsFor is well-formed', async () => {
	await assert.doesNotReject(() => validateModelCatalog());   // no override → the shipped asset
	const cat = getCuratedCatalog();
	for (const provider of ['cli-claude', 'cli-codex'] as const) {
		for (const m of cat.modelsFor(provider)) {
			assert.equal(typeof m.id, 'string');
			assert.ok(m.id.length > 0);
			if (m.displayName !== undefined) assert.equal(typeof m.displayName, 'string');
		}
	}
	// a real curated set: at least one model per cloud provider.
	assert.ok(cat.modelsFor('cli-claude').length > 0, 'cli-claude has curated models');
	assert.ok(cat.modelsFor('cli-codex').length > 0, 'cli-codex has curated models');
});

// ── smoke: the catalog ships under out/assets/models when built ──────────────

const here = dirname(fileURLToPath(import.meta.url));
const builtCatalog = join(here, '..', '..', '..', 'out', 'assets', 'models', CATALOG_FILE);
const builtReady = existsSync(builtCatalog);

test('smoke: the built out/assets/models stages the catalog JSON, non-empty', { skip: !builtReady }, () => {
	assert.ok(statSync(builtCatalog).size > 0, 'catalog staged + non-empty under out/');
	const parsed = JSON.parse(readFileSync(builtCatalog, 'utf8')) as CloudModelCatalogFile;
	assert.equal(typeof parsed.version, 'number');
	const srcCatalog = join(here, '..', '..', 'assets', 'models', CATALOG_FILE);   // git-tracked source
	assert.ok(existsSync(srcCatalog), 'catalog present under git-tracked src/assets/models');
});

/** Local mutable alias for the frozen-array immutability assertion. */
type CatalogModelMut = { id: string; displayName?: string };

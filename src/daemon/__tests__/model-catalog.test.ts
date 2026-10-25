/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Model definitions file tests (Epic ce99b72065d03b1b, Story s1 · t1).
 *
 * The synchronous loader validateModelCatalog is exercised against TEMP asset
 * dirs via _setModelCatalogDirForTests: one refusal per rule (each naming the
 * entry and rule), the per-thread cache, and the stopgap getCuratedCatalog
 * projection providers.listModels reads until s2. The shipped asset's contract
 * lives in model-catalog-asset.test.ts.
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
} from '../model-catalog.js';

const CATALOG_FILE = 'cloud-model-catalog.json';

/** A valid minimal fixture with all three families. */
function valid(): Record<string, any> {
	return {
		version: 1,
		defaultFamily: 'cli-claude',
		families: [
			{
				id: 'cli-claude', cliKind: 'claude', displayName: 'Claude',
				models: [
					{ id: 'claude-big', aliases: ['big'], displayName: 'Claude Big', efforts: ['low', 'high'] },
					{ id: 'claude-small', aliases: ['small'], efforts: ['low'] },
					{ id: 'claude-plain', efforts: [] },
				],
				tierDefaults: { core: { model: 'big', effort: 'high' }, mid: { model: 'claude-big' }, cheap: { model: 'small' } },
				summariserModel: 'small',
			},
			{
				id: 'cli-codex', cliKind: 'codex', displayName: 'Codex',
				models: [{ id: 'gpt-a', efforts: ['low', 'ultra'] }, { id: 'gpt-b', displayName: 'GPT B', efforts: ['low'] }],
				tierDefaults: { core: { model: 'gpt-a' }, mid: { model: 'gpt-a' }, cheap: { model: 'gpt-b' } },
				summariserModel: 'gpt-b',
			},
			{
				id: 'ollama', displayName: 'Ollama',
				models: [{ id: 'qwen:1b', efforts: [], inputLimit: { unit: 'tokens', max: 8192 } }],
				toolLoopModel: 'qwen:1b',
			},
		],
	};
}

const tmpDirs: string[] = [];
/** A temp asset dir holding `body`; null = no catalog file. */
function useAsset(body: string | null): string {
	const dir = mkdtempSync(join(tmpdir(), 'model-catalog-'));
	tmpDirs.push(dir);
	if (body !== null) writeFileSync(join(dir, CATALOG_FILE), body);
	_setModelCatalogDirForTests(dir);
	return dir;
}

afterEach(() => {
	_setModelCatalogDirForTests(undefined);
	_resetModelCatalogForTests();
	for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** One fixture per refusal reason: [label, fixture body, expected reason]. */
function refusals(): Array<[string, string | null, RegExp]> {
	const mut = (f: (x: Record<string, any>) => void): string => { const x = valid(); f(x); return JSON.stringify(x); };
	return [
		['missing file', null, /^file not found$/],
		['malformed JSON', '{ not json', /^malformed JSON: /],
		['non-numeric version', mut(x => { x.version = '1'; }), /missing or non-numeric `version`/],
		['defaultFamily ollama', mut(x => { x.defaultFamily = 'ollama'; }), /defaultFamily 'ollama' is not a CLI family/],
		['unknown family', mut(x => { x.families[2].id = 'gemini'; }), /families\[2\]: unknown family id 'gemini'/],
		['repeated family', mut(x => { x.families.push(valid().families[1]); }), /families\[3\]: family 'cli-codex' is repeated/],
		['missing ollama family', mut(x => { x.families.pop(); }), /families: family 'ollama' is missing/],
		['missing non-default CLI family', mut(x => { x.families.splice(1, 1); }), /families: family 'cli-codex' is missing/],
		['CLI family without cliKind', mut(x => { delete x.families[1].cliKind; }), /families\[1\] \(cli-codex\): cliKind is missing/],
		['CLI family without tierDefaults', mut(x => { delete x.families[0].tierDefaults; }), /families\[0\] \(cli-claude\): tierDefaults is missing/],
		['CLI family without summariserModel', mut(x => { delete x.families[1].summariserModel; }), /families\[1\] \(cli-codex\): summariserModel is missing/],
		['model without efforts', mut(x => { delete x.families[1].models[1].efforts; }), /families\[1\] \(cli-codex\): models\[1\] 'gpt-b' has no efforts list/],
		['duplicate id', mut(x => { x.families[1].models[1].id = 'gpt-a'; }), /families\[1\] \(cli-codex\): duplicate id or alias 'gpt-a'/],
		['duplicate alias', mut(x => { x.families[0].models[1].aliases = ['big']; }), /families\[0\] \(cli-claude\): duplicate id or alias 'big'/],
		['tier default not in family', mut(x => { x.families[1].tierDefaults.mid.model = 'gpt-9'; }), /families\[1\] \(cli-codex\): tierDefaults\.mid\.model 'gpt-9' is not a model or alias of cli-codex/],
		['summariser not in family', mut(x => { x.families[0].summariserModel = 'gpt-b'; }), /families\[0\] \(cli-claude\): summariserModel 'gpt-b' is not a model or alias of cli-claude/],
		['toolLoopModel not listed', mut(x => { x.families[2].toolLoopModel = 'llama:7b'; }), /families\[2\] \(ollama\): toolLoopModel 'llama:7b' is not a listed model id of ollama/],
		['Ollama model without token inputLimit', mut(x => { x.families[2].models[0].inputLimit = { unit: 'chars', max: 100 }; }), /families\[2\] \(ollama\): model 'qwen:1b' has no token inputLimit/],
		['tier default effort not among its model\'s efforts (by id)', mut(x => { x.families[1].tierDefaults.cheap = { model: 'gpt-b', effort: 'ultra' }; }), /families\[1\] \(cli-codex\): tierDefaults\.cheap\.effort 'ultra' is not an effort of gpt-b/],
		['tier default effort not among its model\'s efforts (by alias)', mut(x => { x.families[0].tierDefaults.cheap = { model: 'small', effort: 'high' }; }), /families\[0\] \(cli-claude\): tierDefaults\.cheap\.effort 'high' is not an effort of claude-small/],
		['tier default effort on a model whose efforts are []', mut(x => { x.families[0].tierDefaults.mid = { model: 'claude-plain', effort: 'low' }; }), /families\[0\] \(cli-claude\): tierDefaults\.mid\.effort 'low' is not an effort of claude-plain/],
	];
}

test('model-catalog.test.ts: one synchronous refusal per fixture reason, each naming the entry and rule (incl. the three tier-default effort fixtures)', () => {
	for (const [label, body, reason] of refusals()) {
		const dir = useAsset(body);
		assert.throws(() => validateModelCatalog(), (e: unknown) => {
			assert.ok(e instanceof ModelCatalogValidationError, `${label}: ModelCatalogValidationError`);
			assert.equal(e.path, join(dir, CATALOG_FILE), `${label}: names the file`);
			assert.match(e.reason, reason, label);
			assert.equal((e.message.match(/Fix:/g) ?? []).length, 1);
			return true;
		}, label);
		// Nothing is cached on failure.
		assert.throws(() => getCuratedCatalog(), /before validateModelCatalog/, `${label}: nothing cached`);
		_resetModelCatalogForTests();
	}
});

test('model-catalog.test.ts: a valid fixture whose tier default names its model by alias and carries an accepted effort validates', () => {
	useAsset(JSON.stringify(valid()));
	const file = validateModelCatalog();
	assert.deepEqual(file.families[0]!.tierDefaults?.core, { model: 'big', effort: 'high' });
});

test('model-catalog.test.ts: validateModelCatalog returns and caches the frozen file; a second call does not re-read', () => {
	const dir = useAsset(JSON.stringify(valid()));
	const first = validateModelCatalog();
	assert.equal(first.defaultFamily, 'cli-claude');
	assert.deepEqual(first.families.map(f => f.id), ['cli-claude', 'cli-codex', 'ollama']);
	assert.ok(Object.isFrozen(first) && Object.isFrozen(first.families) && Object.isFrozen(first.families[0]!.models));
	assert.ok(Object.isFrozen(first.families[0]!.models[0]!.efforts));
	// The file is gone from disk: a second call is served from the cache.
	rmSync(join(dir, CATALOG_FILE));
	assert.equal(validateModelCatalog(), first);
	// After the reset seam the loader reads again and refuses the missing file.
	_resetModelCatalogForTests();
	assert.throws(() => validateModelCatalog(), /file not found/);
});

test('model-catalog.test.ts: getCuratedCatalog().modelsFor projects each CLI family\'s listed models in file order', () => {
	useAsset(JSON.stringify(valid()));
	validateModelCatalog();
	const cat = getCuratedCatalog();
	assert.deepEqual(cat.modelsFor('cli-claude'), [
		{ id: 'claude-big', displayName: 'Claude Big' },
		{ id: 'claude-small' },
		{ id: 'claude-plain' },
	]);
	assert.deepEqual(cat.modelsFor('cli-codex'), [{ id: 'gpt-a' }, { id: 'gpt-b', displayName: 'GPT B' }]);
	assert.throws(() => { (cat.modelsFor('cli-codex') as Array<{ id: string }>).push({ id: 'x' }); });
});

test('getCuratedCatalog before validateModelCatalog populated the cache → throws the boot-ordering Error', () => {
	assert.throws(() => getCuratedCatalog(), (e: unknown) => {
		assert.ok(e instanceof Error);
		assert.ok(!(e instanceof ModelCatalogValidationError), 'a boot-ordering bug, not a bad-catalog error');
		assert.match((e as Error).message, /before validateModelCatalog/);
		return true;
	});
});

test('modelCatalogDir(): the in-process override, else INSRC_MODEL_CATALOG_DIR, else MODEL_CATALOG_DIR', () => {
	const saved = process.env['INSRC_MODEL_CATALOG_DIR'];
	try {
		delete process.env['INSRC_MODEL_CATALOG_DIR'];
		assert.equal(modelCatalogDir(), MODEL_CATALOG_DIR);
		assert.match(MODEL_CATALOG_DIR, /assets[\\/]models$/);
		process.env['INSRC_MODEL_CATALOG_DIR'] = '/tmp/env-models';
		assert.equal(modelCatalogDir(), '/tmp/env-models');
		_setModelCatalogDirForTests('/tmp/override-models');
		assert.equal(modelCatalogDir(), '/tmp/override-models');
	} finally {
		if (saved === undefined) delete process.env['INSRC_MODEL_CATALOG_DIR'];
		else process.env['INSRC_MODEL_CATALOG_DIR'] = saved;
	}
});

// ── smoke: the definitions file ships under out/assets/models when built ─────

const here = dirname(fileURLToPath(import.meta.url));
const builtCatalog = join(here, '..', '..', '..', 'out', 'assets', 'models', CATALOG_FILE);
const builtReady = existsSync(builtCatalog);

test('smoke: the built out/assets/models stages the catalog JSON, non-empty', { skip: !builtReady }, () => {
	assert.ok(statSync(builtCatalog).size > 0, 'catalog staged + non-empty under out/');
	const parsed = JSON.parse(readFileSync(builtCatalog, 'utf8')) as { version: unknown };
	assert.equal(typeof parsed.version, 'number');
});

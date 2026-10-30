/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Model definitions file tests (Epic ce99b72065d03b1b, Story s1 · t1).
 *
 * The synchronous loader validateModelCatalog is exercised against TEMP asset
 * dirs via _setModelCatalogDirForTests: one refusal per rule (each naming the
 * entry and rule) and the per-thread cache. The shipped asset's contract lives
 * in model-catalog-asset.test.ts.
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
	ModelCatalogValidationError,
	MODEL_CATALOG_DIR,
	modelCatalogDir,
	_setModelCatalogDirForTests,
	_resetModelCatalogForTests,
} from '../model-catalog.js';

const CATALOG_FILE = 'cloud-model-catalog.json';

/** A valid minimal fixture with all five families (ollama-claude with one cloud and one local model). */
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
			{
				id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama',
				models: [
					{ id: 'glm:cloud', aliases: ['glm'], efforts: ['low', 'high'], hosting: 'cloud' },
					{ id: 'qwen:local', efforts: [], hosting: 'local' },
				],
			},
			{
				id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe',
				models: [{ id: 'vibe-big', aliases: ['vbig'], efforts: ['low', 'max'] }, { id: 'vibe-small', efforts: ['low'] }],
				tierDefaults: { core: { model: 'vbig' }, mid: { model: 'vibe-big' }, cheap: { model: 'vibe-small' } },
				summariserModel: 'vibe-small',
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
		['repeated family', mut(x => { x.families.push(valid().families[1]); }), /families\[5\]: family 'cli-codex' is repeated/],
		['missing ollama family', mut(x => { x.families.splice(2, 1); }), /families: family 'ollama' is missing/],
		['missing host family', mut(x => { x.families.splice(3, 1); }), /families: family 'ollama-claude' is missing/],
		['missing vibe family', mut(x => { x.families.splice(4, 1); }), /families: family 'cli-vibe' is missing/],
		['vibe family without cliKind', mut(x => { delete x.families[4].cliKind; }), /families\[4\] \(cli-vibe\): cliKind is missing/],
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
		// Nothing is cached on failure: once the file is fixed, the next call loads it.
		writeFileSync(join(dir, CATALOG_FILE), JSON.stringify(valid()));
		assert.equal(validateModelCatalog().version, 1, `${label}: nothing cached`);
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
	assert.deepEqual(first.families.map(f => f.id), ['cli-claude', 'cli-codex', 'ollama', 'ollama-claude', 'cli-vibe']);
	assert.ok(Object.isFrozen(first) && Object.isFrozen(first.families) && Object.isFrozen(first.families[0]!.models));
	assert.ok(Object.isFrozen(first.families[0]!.models[0]!.efforts));
	// The file is gone from disk: a second call is served from the cache.
	rmSync(join(dir, CATALOG_FILE));
	assert.equal(validateModelCatalog(), first);
	// After the reset seam the loader reads again and refuses the missing file.
	_resetModelCatalogForTests();
	assert.throws(() => validateModelCatalog(), /file not found/);
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

test('model-catalog.test.ts: memoryMb accepted on Ollama models, refused when not a positive integer or on a CLI model', () => {
	// Accepted: an Ollama model with memoryMb, and one without it.
	const ok = valid();
	ok.families[2].models = [{ id: 'qwen:1b', efforts: [], inputLimit: { unit: 'tokens', max: 8192 }, memoryMb: 14000 }, { id: 'qwen:2b', efforts: [], inputLimit: { unit: 'tokens', max: 8192 } }];
	useAsset(JSON.stringify(ok));
	const ollama = validateModelCatalog().families.find(f => f.id === 'ollama')!;
	assert.equal(ollama.models[0]!.memoryMb, 14000);
	assert.ok(!('memoryMb' in ollama.models[1]!), 'absent stays absent');
	_resetModelCatalogForTests();

	const refused: Array<[string, (x: Record<string, any>) => void, RegExp]> = [
		...([0, -1, 1.5, '14000'] as unknown[]).map((v): [string, (x: Record<string, any>) => void, RegExp] => [
			`memoryMb ${JSON.stringify(v)}`, x => { x.families[2].models[0].memoryMb = v; },
			/families\[2\] \(ollama\): models\[0\] 'qwen:1b': memoryMb is not a positive whole number of MB/]),
		['memoryMb on a CLI model', x => { x.families[1].models[0].memoryMb = 4000; }, /families\[1\] \(cli-codex\): model 'gpt-a' has memoryMb, which only Ollama models take/],
	];
	for (const [label, mutate, reason] of refused) {
		const x = valid();
		mutate(x);
		useAsset(JSON.stringify(x));
		assert.throws(() => validateModelCatalog(), (e: unknown) => e instanceof ModelCatalogValidationError && reason.test(e.reason), label);
		_resetModelCatalogForTests();
	}
});

// ── the Ollama-hosted family (Epic b220bb61, Story s1 · t1) ──────────────────

test('model-catalog.test.ts: the five-family fixture with ollama-claude and cli-vibe validates', () => {
	useAsset(JSON.stringify(valid()));
	const host = validateModelCatalog().families.find(f => f.id === 'ollama-claude')!;
	assert.equal(host.cliKind, 'claude');
	assert.equal(host.host, 'ollama');
	assert.deepEqual(host.models.map(m => [m.id, m.hosting]), [['glm:cloud', 'cloud'], ['qwen:local', 'local']]);
	assert.ok(!('tierDefaults' in host) && !('summariserModel' in host) && !('toolLoopModel' in host));
	const vibe = validateModelCatalog().families.find(f => f.id === 'cli-vibe')!;
	assert.equal(vibe.cliKind, 'vibe');
	assert.deepEqual(vibe.tierDefaults?.core, { model: 'vbig' });
	assert.equal(vibe.summariserModel, 'vibe-small');
});

/** Expect one refusal of `mutate(valid())` whose reason matches `reason`. */
function assertRefused(label: string, mutate: (x: Record<string, any>) => void, reason: RegExp): void {
	const x = valid();
	mutate(x);
	useAsset(JSON.stringify(x));
	assert.throws(() => validateModelCatalog(), (e: unknown) => {
		assert.ok(e instanceof ModelCatalogValidationError, `${label}: ModelCatalogValidationError`);
		assert.match(e.reason, reason, label);
		return true;
	}, label);
	_resetModelCatalogForTests();
}

test("model-catalog.test.ts: a host family missing host, cliKind or a model's hosting, or carrying tierDefaults or summariserModel, fails naming the family and field", () => {
	const at = 'families\\[3\\] \\(ollama-claude\\)';
	const cases: Array<[string, (x: Record<string, any>) => void, RegExp]> = [
		['no host', x => { delete x.families[3].host; }, new RegExp(`${at}: host is missing or not 'ollama'`)],
		['wrong host', x => { x.families[3].host = 'lmstudio'; }, new RegExp(`${at}: host is missing or not 'ollama'`)],
		['no cliKind', x => { delete x.families[3].cliKind; }, new RegExp(`${at}: cliKind is missing or not 'claude' \\| 'codex'`)],
		['model without hosting', x => { delete x.families[3].models[1].hosting; }, new RegExp(`${at}: model 'qwen:local' has no hosting`)],
		['bad hosting value', x => { x.families[3].models[0].hosting = 'remote'; }, new RegExp(`${at}: models\\[0\\] 'glm:cloud': hosting is not 'cloud' \\| 'local'`)],
		['tierDefaults', x => { x.families[3].tierDefaults = valid().families[0].tierDefaults; }, new RegExp(`${at}: tierDefaults is not allowed`)],
		['summariserModel', x => { x.families[3].summariserModel = 'glm'; }, new RegExp(`${at}: summariserModel is not allowed`)],
	];
	for (const [label, mutate, reason] of cases) assertRefused(label, mutate, reason);
});

test('model-catalog.test.ts: hosting on a vendor or plain-Ollama model fails', () => {
	assertRefused('hosting on a vendor model', x => { x.families[0].models[0].hosting = 'cloud'; },
		/families\[0\] \(cli-claude\): model 'claude-big' has hosting, which only Ollama-hosted families take/);
	assertRefused('hosting on a plain-Ollama model', x => { x.families[2].models[0].hosting = 'local'; },
		/families\[2\] \(ollama\): model 'qwen:1b' has hosting, which only Ollama-hosted families take/);
	assertRefused('host on a vendor family', x => { x.families[1].host = 'ollama'; },
		/families\[1\] \(cli-codex\): host is only allowed on an Ollama-hosted family/);
});

test('model-catalog.test.ts: the existing families validate as before', () => {
	useAsset(JSON.stringify(valid()));
	const families = validateModelCatalog().families;
	const byId = (id: string) => families.find(f => f.id === id);
	const [claude, codex, ollama, vibe] = [byId('cli-claude'), byId('cli-codex'), byId('ollama'), byId('cli-vibe')];
	assert.deepEqual(claude, {
		id: 'cli-claude', cliKind: 'claude', displayName: 'Claude',
		models: [
			{ id: 'claude-big', aliases: ['big'], displayName: 'Claude Big', efforts: ['low', 'high'] },
			{ id: 'claude-small', aliases: ['small'], efforts: ['low'] },
			{ id: 'claude-plain', efforts: [] },
		],
		tierDefaults: { core: { model: 'big', effort: 'high' }, mid: { model: 'claude-big' }, cheap: { model: 'small' } },
		summariserModel: 'small',
	});
	assert.deepEqual(codex, {
		id: 'cli-codex', cliKind: 'codex', displayName: 'Codex',
		models: [{ id: 'gpt-a', efforts: ['low', 'ultra'] }, { id: 'gpt-b', displayName: 'GPT B', efforts: ['low'] }],
		tierDefaults: { core: { model: 'gpt-a' }, mid: { model: 'gpt-a' }, cheap: { model: 'gpt-b' } },
		summariserModel: 'gpt-b',
	});
	assert.deepEqual(ollama, {
		id: 'ollama', displayName: 'Ollama',
		models: [{ id: 'qwen:1b', efforts: [], inputLimit: { unit: 'tokens', max: 8192 } }],
		toolLoopModel: 'qwen:1b',
	});
	assert.deepEqual(vibe, {
		id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe',
		models: [{ id: 'vibe-big', aliases: ['vbig'], efforts: ['low', 'max'] }, { id: 'vibe-small', efforts: ['low'] }],
		tierDefaults: { core: { model: 'vbig' }, mid: { model: 'vibe-big' }, cheap: { model: 'vibe-small' } },
		summariserModel: 'vibe-small',
	});
	for (const f of [claude, codex, ollama, vibe]) assert.ok(!('host' in f!), `${f!.id} has no host`);
});

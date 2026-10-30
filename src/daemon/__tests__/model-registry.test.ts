/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ModelRegistry + approved-model store tests (Epic ce99b72065d03b1b, Story s1 · t2).
 *
 * Each test points the definitions loader at a TEMP asset dir and the store
 * reader at a TEMP store path; _resetModelRegistryForTests stands in for a
 * restart (it drops both the registry and the definitions file cache).
 *
 * Run: npx tsx --test src/daemon/__tests__/model-registry.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _setModelCatalogDirForTests } from '../model-catalog.js';
import { projectDefinitions } from '../model-definitions.js';
import {
	familyForClient,
	getModelRegistry,
	profileProblem,
	_resetModelRegistryForTests,
	_setApprovedModelsPathForTests,
	type ApprovedProfile,
} from '../model-registry.js';

/** The baseline fixture: all families, one alias-named default with an effort. */
function baseline(): Record<string, any> {
	return {
		version: 1,
		defaultFamily: 'cli-claude',
		families: [
			{
				id: 'cli-claude', cliKind: 'claude', displayName: 'Claude',
				models: [
					{ id: 'claude-big', aliases: ['big'], displayName: 'Claude Big', efforts: ['low', 'high'] },
					{ id: 'claude-small', aliases: ['small'], efforts: ['low'], inputLimit: { unit: 'tokens', max: 1000 } },
				],
				tierDefaults: { core: { model: 'big', effort: 'high' }, mid: { model: 'claude-big' }, cheap: { model: 'small' } },
				summariserModel: 'small',
			},
			{
				id: 'cli-codex', cliKind: 'codex', displayName: 'Codex',
				models: [{ id: 'gpt-a', efforts: ['low', 'ultra'] }, { id: 'gpt-b', efforts: ['low'] }],
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
				models: [{ id: 'glm:cloud', efforts: ['low'], hosting: 'cloud' }],
			},
			{
				id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe',
				models: [{ id: 'vibe-a', aliases: ['va'], efforts: ['low', 'max'] }, { id: 'vibe-s', efforts: ['low'] }],
				tierDefaults: { core: { model: 'va' }, mid: { model: 'vibe-a' }, cheap: { model: 'vibe-s' } },
				summariserModel: 'vibe-s',
			},
		],
	};
}

const tmpDirs: string[] = [];
function tmp(): string { const d = mkdtempSync(join(tmpdir(), 'model-registry-')); tmpDirs.push(d); return d; }

/** Point the loader at a temp asset holding `defs`, and the store at `store` (null = absent; string = raw text). */
function use(defs: Record<string, any>, store: { version: number; profiles: unknown[] } | string | null = null): { assetDir: string; storeFile: string } {
	const assetDir = tmp();
	writeFileSync(join(assetDir, 'cloud-model-catalog.json'), JSON.stringify(defs));
	const storeFile = join(tmp(), 'approved-models.json');
	if (store !== null) writeFileSync(storeFile, typeof store === 'string' ? store : JSON.stringify(store));
	_setModelCatalogDirForTests(assetDir);
	_setApprovedModelsPathForTests(storeFile);
	return { assetDir, storeFile };
}

function profile(p: Partial<ApprovedProfile> & Pick<ApprovedProfile, 'modelId' | 'status' | 'decidedAt'>): ApprovedProfile {
	return { family: 'cli-codex', efforts: [], cliVersion: '1.0.0', ...p };
}

afterEach(() => {
	_setModelCatalogDirForTests(undefined);
	_setApprovedModelsPathForTests(undefined);
	_resetModelRegistryForTests();
	for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test('model-registry.test.ts: families/defaultFamily/models/find/tierDefault/summariserModel/toolLoopModel/cliKind against the minimal fixture', () => {
	use(baseline());
	const r = getModelRegistry();
	assert.deepEqual(r.families().map(f => f.id), ['cli-claude', 'cli-codex', 'ollama', 'ollama-claude', 'cli-vibe']);
	assert.equal(r.defaultFamily(), 'cli-claude');
	assert.deepEqual(r.models('cli-claude').map(m => [m.id, m.family, m.source]), [
		['claude-big', 'cli-claude', 'shipped'], ['claude-small', 'cli-claude', 'shipped'],
	]);
	assert.deepEqual(r.models('ollama').map(m => m.id), ['qwen:1b']);
	assert.equal(r.find('cli-claude', 'big')?.id, 'claude-big');
	assert.equal(r.find('cli-claude', 'claude-small')?.id, 'claude-small');
	assert.equal(r.find('cli-claude', 'BIG'), undefined, 'case-sensitive');
	assert.equal(r.find('cli-codex', 'big'), undefined, 'within the family only');
	assert.deepEqual(r.find('cli-claude', 'small')?.inputLimit, { unit: 'tokens', max: 1000 });
	assert.deepEqual(r.tierDefault('cli-claude', 'core'), { model: 'big', effort: 'high' });
	assert.deepEqual(r.tierDefault('cli-codex', 'cheap'), { model: 'gpt-b' });
	assert.equal(r.summariserModel('cli-claude').id, 'claude-small');
	assert.equal(r.summariserModel('cli-codex').id, 'gpt-b');
	assert.equal(r.toolLoopModel().id, 'qwen:1b');
	assert.equal(r.cliKind('cli-claude'), 'claude');
	assert.equal(r.cliKind('cli-codex'), 'codex');
	assert.equal(r.cliKind('cli-vibe'), 'vibe');
	assert.equal(r.cliKind('ollama'), undefined);
	assert.equal(r.summariserModel('cli-vibe').id, 'vibe-s');
	assert.deepEqual(r.rejected('cli-codex'), []);
	assert.deepEqual(r.rejected('cli-vibe'), []);
});

test('model-registry.test.ts: store fixtures (absent, malformed, wrong shape, one bad entry, shadowed approval, approved-vs-rejected by decidedAt) yield the stated models() and rejected()', () => {
	const shipped = ['gpt-a', 'gpt-b'];
	const codexIds = (): string[] => getModelRegistry().models('cli-codex').map(m => m.id);

	// absent / malformed JSON / wrong shape -> empty store, registry still builds.
	for (const store of [null, '{ nope', JSON.stringify({ version: 1, profiles: {} }), JSON.stringify([1, 2])]) {
		use(baseline(), store);
		assert.deepEqual(codexIds(), shipped, `store ${String(store)}`);
		assert.deepEqual(getModelRegistry().rejected('cli-codex'), []);
		_resetModelRegistryForTests();
	}

	// one bad entry among good ones -> only that entry is skipped.
	use(baseline(), { version: 1, profiles: [
		profile({ modelId: 'gpt-new', status: 'approved', efforts: ['low'], decidedAt: '2026-10-01T00:00:00Z' }),
		{ family: 'gemini', modelId: 'x', status: 'approved', efforts: [], decidedAt: '2026-10-01T00:00:00Z', cliVersion: '1' },
		profile({ modelId: 'gpt-bad', status: 'maybe' as 'approved', decidedAt: '2026-10-01T00:00:00Z' }),
		profile({ modelId: 'gpt-gone', status: 'rejected', decidedAt: '2026-10-02T00:00:00Z' }),
	] });
	assert.deepEqual(codexIds(), [...shipped, 'gpt-new']);
	const added = getModelRegistry().find('cli-codex', 'gpt-new');
	assert.equal(added?.source, 'user-approved');
	assert.deepEqual(added?.efforts, ['low']);
	assert.deepEqual(getModelRegistry().rejected('cli-codex'), ['gpt-gone']);
	_resetModelRegistryForTests();

	// shadowed approval: the shipped definition wins.
	use(baseline(), { version: 1, profiles: [
		profile({ modelId: 'gpt-a', status: 'approved', efforts: ['low', 'mega'], decidedAt: '2026-10-01T00:00:00Z' }),
	] });
	assert.deepEqual(codexIds(), shipped);
	assert.equal(getModelRegistry().find('cli-codex', 'gpt-a')?.source, 'shipped');
	assert.deepEqual(getModelRegistry().find('cli-codex', 'gpt-a')?.efforts, ['low', 'ultra']);
	_resetModelRegistryForTests();

	// approved vs rejected for the same id: the later decidedAt is effective, either way round.
	use(baseline(), { version: 1, profiles: [
		profile({ modelId: 'gpt-x', status: 'rejected', decidedAt: '2026-10-05T00:00:00Z' }),
		profile({ modelId: 'gpt-x', status: 'approved', efforts: ['low'], decidedAt: '2026-10-01T00:00:00Z' }),
		profile({ modelId: 'gpt-y', status: 'rejected', decidedAt: '2026-10-01T00:00:00Z' }),
		profile({ modelId: 'gpt-y', status: 'approved', efforts: ['low'], decidedAt: '2026-10-06T00:00:00Z' }),
	] });
	assert.deepEqual(codexIds(), [...shipped, 'gpt-y']);
	assert.deepEqual(getModelRegistry().rejected('cli-codex'), ['gpt-x']);
});

test('model-registry.test.ts: effortLevels includes an approved-only effort after its family\'s shipped efforts and excludes rejected or shadowed efforts', () => {
	use(baseline(), { version: 1, profiles: [
		profile({ modelId: 'gpt-new', status: 'approved', efforts: ['low', 'warp'], decidedAt: '2026-10-01T00:00:00Z' }),
		profile({ modelId: 'gpt-rej', status: 'rejected', efforts: ['nope'], decidedAt: '2026-10-01T00:00:00Z' }),
		profile({ modelId: 'gpt-old', status: 'approved', efforts: ['stale'], decidedAt: '2026-10-01T00:00:00Z' }),
		profile({ modelId: 'gpt-old', status: 'rejected', decidedAt: '2026-10-03T00:00:00Z' }),
		profile({ modelId: 'gpt-a', status: 'approved', efforts: ['shadow'], decidedAt: '2026-10-01T00:00:00Z' }),
	] });
	// claude shipped (low, high), codex shipped (ultra) then approved (warp), vibe shipped (max); ollama adds none.
	assert.deepEqual(getModelRegistry().effortLevels(), ['low', 'high', 'ultra', 'warp', 'max']);
});

test('model-registry.test.ts: resolveTier keeps an accepted effort, drops an unaccepted one, falls back with rejected-model vs unlisted-model, uses the default family for an Ollama tier, and an alias-named default\'s effort is returned and accepted', () => {
	use(baseline(), { version: 1, profiles: [
		profile({ modelId: 'gpt-rej', status: 'rejected', decidedAt: '2026-10-01T00:00:00Z' }),
	] });
	const r = getModelRegistry();

	const kept = r.resolveTier('mid', { runner: 'cli-codex', model: 'gpt-a', effort: 'ultra' });
	assert.equal(kept.model.id, 'gpt-a');
	assert.equal(kept.effort, 'ultra');
	assert.equal(kept.droppedEffort, undefined);
	assert.equal(kept.fallback, undefined);

	const dropped = r.resolveTier('cheap', { runner: 'cli-codex', model: 'gpt-b', effort: 'ultra' });
	assert.equal(dropped.model.id, 'gpt-b');
	assert.equal(dropped.effort, undefined);
	assert.equal(dropped.droppedEffort, 'ultra');

	const viaAlias = r.resolveTier('cheap', { runner: 'cli-claude', model: 'small' });
	assert.equal(viaAlias.model.id, 'claude-small');
	assert.equal(viaAlias.fallback, undefined);

	const rejected = r.resolveTier('cheap', { runner: 'cli-codex', model: 'gpt-rej', effort: 'low' });
	assert.deepEqual(rejected.fallback, { reason: 'rejected-model', requested: 'gpt-rej' });
	assert.equal(rejected.family, 'cli-codex');
	assert.equal(rejected.model.id, 'gpt-b');

	const unlisted = r.resolveTier('mid', { runner: 'cli-codex', model: 'gpt-9' });
	assert.deepEqual(unlisted.fallback, { reason: 'unlisted-model', requested: 'gpt-9' });
	assert.equal(unlisted.model.id, 'gpt-a');

	const ollama = r.resolveTier('mid', { runner: 'ollama', model: 'llama:70b' });
	assert.deepEqual(ollama.fallback, { reason: 'unlisted-model', requested: 'llama:70b' });
	assert.equal(ollama.family, 'cli-claude', 'the default family');
	assert.equal(ollama.model.id, 'claude-big');

	const ollamaListed = r.resolveTier('core', { runner: 'ollama', model: 'qwen:1b', effort: 'high' });
	assert.equal(ollamaListed.model.id, 'qwen:1b');
	assert.equal(ollamaListed.droppedEffort, 'high', 'efforts: [] accepts none');

	// The core default names its model by alias ('big') with effort 'high': a fallback returns that effort, and the model accepts it.
	const aliasDefault = r.resolveTier('core', { runner: 'cli-claude', model: 'claude-unknown', effort: 'low' });
	assert.equal(aliasDefault.model.id, 'claude-big');
	assert.equal(aliasDefault.effort, 'high');
	assert.ok(aliasDefault.model.efforts.includes(aliasDefault.effort!));

	// Never an effort the returned model does not accept.
	for (const res of [kept, dropped, viaAlias, rejected, unlisted, ollama, ollamaListed, aliasDefault]) {
		if (res.effort !== undefined) assert.ok(res.model.efforts.includes(res.effort));
	}
});

test('model-registry.test.ts: ac2 fixture after reset serves the new model, alias and \'turbo\' through models(), find(), effortLevels(), resolveTier() and the models.definitions projection', () => {
	const { assetDir } = use(baseline());
	assert.equal(getModelRegistry().find('cli-codex', 'gpt-c'), undefined);
	assert.ok(!getModelRegistry().effortLevels().includes('turbo'));

	// The ac2 fixture: baseline + one added model with an alias and a novel effort. No code change.
	const ac2 = baseline();
	ac2.families[1].models.push({ id: 'gpt-c', aliases: ['cee'], efforts: ['low', 'turbo'] });
	writeFileSync(join(assetDir, 'cloud-model-catalog.json'), JSON.stringify(ac2));
	_resetModelRegistryForTests();

	const r = getModelRegistry();
	assert.deepEqual(r.models('cli-codex').map(m => m.id), ['gpt-a', 'gpt-b', 'gpt-c']);
	assert.deepEqual(r.find('cli-codex', 'cee')?.efforts, ['low', 'turbo']);
	assert.ok(r.effortLevels().includes('turbo'));
	const res = r.resolveTier('mid', { runner: 'cli-codex', model: 'cee', effort: 'turbo' });
	assert.equal(res.model.id, 'gpt-c');
	assert.equal(res.effort, 'turbo');
	assert.equal(res.droppedEffort, undefined);
	assert.equal(res.fallback, undefined);
	assert.ok(projectDefinitions(r, 1, undefined).families.find(f => f.id === 'cli-codex')!.models.some(m => m.id === 'gpt-c' && m.aliases.includes('cee')));
});

test('model-registry.test.ts: getModelRegistry() returns the same cached registry after the file changes on disk', () => {
	const { assetDir, storeFile } = use(baseline());
	const first = getModelRegistry();
	const changed = baseline();
	changed.families[1].models.push({ id: 'gpt-c', efforts: [] });
	writeFileSync(join(assetDir, 'cloud-model-catalog.json'), JSON.stringify(changed));
	writeFileSync(storeFile, JSON.stringify({ version: 1, profiles: [
		profile({ modelId: 'gpt-d', status: 'approved', decidedAt: '2026-10-01T00:00:00Z' }),
	] }));
	const second = getModelRegistry();
	assert.equal(second, first);
	assert.deepEqual(second.models('cli-codex').map(m => m.id), ['gpt-a', 'gpt-b']);
});

test('model-registry.test.ts: the exported profileProblem returns undefined for a valid profile and a reason for each invalid shape the reader skips', () => {
	const valid = profile({ modelId: 'gpt-x', status: 'approved', decidedAt: '2026-10-01T00:00:00Z', efforts: ['high'], inputLimit: { unit: 'tokens', max: 1000 } });
	assert.equal(profileProblem(valid), undefined);
	const invalid: Array<[unknown, RegExp]> = [
		['a string', /not an object/],
		[[valid], /not an object/],
		[{ ...valid, family: 'ollama' }, /unknown family 'ollama'/],
		[{ ...valid, modelId: '' }, /missing modelId/],
		[{ ...valid, status: 'pending' }, /status 'pending'/],
		[{ ...valid, efforts: [1] }, /efforts is not a list of strings/],
		[{ ...valid, decidedAt: 'yesterday' }, /decidedAt is not a date/],
		[{ ...valid, cliVersion: 2 }, /missing cliVersion/],
		[{ ...valid, inputLimit: { unit: 'bytes', max: 1 } }, /inputLimit is not \{ unit, max \}/],
		[{ ...valid, inputLimit: { unit: 'tokens', max: 0 } }, /inputLimit is not \{ unit, max \}/],
	];
	for (const [entry, reason] of invalid) assert.match(profileProblem(entry) ?? '', reason, JSON.stringify(entry));

	// The reader applies the same rule: only the valid entry survives a store holding all of them.
	const { storeFile } = use(baseline());
	writeFileSync(storeFile, JSON.stringify({ version: 1, profiles: [...invalid.map(([e]) => e), valid] }));
	_resetModelRegistryForTests();
	assert.deepEqual(getModelRegistry().models('cli-codex').filter(m => m.source === 'user-approved').map(m => m.id), ['gpt-x']);
});

// ── the Ollama-hosted family (Epic b220bb61, Story s1 · t2) ──────────────────

/** The baseline with a host family of two models: an aliased cloud model with efforts and a local one with none. */
function withHost(): Record<string, any> {
	const defs = baseline();
	defs.families[3].models = [
		{ id: 'glm:cloud', aliases: ['glm'], efforts: ['low', 'high'], hosting: 'cloud' },
		{ id: 'qwen:local', efforts: [], hosting: 'local' },
	];
	return defs;
}

test("model-registry.test.ts: host() is 'ollama' only for ollama-claude and cliKind() is 'claude' for it", () => {
	use(withHost());
	const r = getModelRegistry();
	assert.equal(r.host('ollama-claude'), 'ollama');
	assert.equal(r.cliKind('ollama-claude'), 'claude');
	for (const id of ['cli-claude', 'cli-codex', 'cli-vibe', 'ollama'] as const) assert.equal(r.host(id), undefined, id);
});

test('model-registry.test.ts: resolveTier on a host family resolves a declared model and alias', () => {
	use(withHost());
	const r = getModelRegistry();
	const byId = r.resolveTier('mid', { runner: 'ollama-claude', model: 'qwen:local' });
	assert.deepEqual([byId.family, byId.model?.id, byId.model?.hosting, byId.fallback], ['ollama-claude', 'qwen:local', 'local', undefined]);
	const byAlias = r.resolveTier('core', { runner: 'ollama-claude', model: 'glm', effort: 'high' });
	assert.deepEqual([byAlias.family, byAlias.model?.id, byAlias.model?.hosting, byAlias.effort, byAlias.fallback],
		['ollama-claude', 'glm:cloud', 'cloud', 'high', undefined]);
});

test('model-registry.test.ts: an effort a host model does not list is dropped', () => {
	use(withHost());
	const r = getModelRegistry();
	const unlisted = r.resolveTier('core', { runner: 'ollama-claude', model: 'glm:cloud', effort: 'max' });
	assert.deepEqual([unlisted.model?.id, unlisted.effort, unlisted.droppedEffort, unlisted.fallback], ['glm:cloud', undefined, 'max', undefined]);
	const none = r.resolveTier('cheap', { runner: 'ollama-claude', model: 'qwen:local', effort: 'low' });
	assert.deepEqual([none.model?.id, none.effort, none.droppedEffort], ['qwen:local', undefined, 'low'], 'efforts: [] accepts none');
});

test("model-registry.test.ts: resolveTier on a host family with an undeclared model returns model undefined and fallback 'model-not-supported' and substitutes nothing", () => {
	use(withHost(), { version: 1, profiles: [
		// An approved claude profile of the same id must not leak into the host family.
		profile({ family: 'cli-claude', modelId: 'kimi:cloud', status: 'approved', efforts: ['low'], decidedAt: '2026-10-01T00:00:00Z' }),
	] });
	const r = getModelRegistry();
	for (const model of ['kimi:cloud', 'claude-big', 'big']) {
		const res = r.resolveTier('core', { runner: 'ollama-claude', model, effort: 'low' });
		assert.deepEqual(res, { family: 'ollama-claude', model: undefined, fallback: { reason: 'model-not-supported', requested: model } }, model);
	}
});

test('model-registry.test.ts: resolveTier on cli-claude, cli-codex and ollama is unchanged with a host family present, including the unlisted and rejected fallbacks', () => {
	const settings = [
		['core', { runner: 'cli-claude', model: 'small', effort: 'high' }],
		['mid', { runner: 'cli-codex', model: 'gpt-a', effort: 'ultra' }],
		['cheap', { runner: 'cli-codex', model: 'gpt-rej' }],
		['mid', { runner: 'cli-codex', model: 'gpt-9' }],
		['core', { runner: 'cli-claude', model: 'claude-unknown', effort: 'low' }],
		['mid', { runner: 'ollama', model: 'llama:70b' }],
		['core', { runner: 'ollama', model: 'qwen:1b', effort: 'high' }],
	] as const;
	const store = { version: 1, profiles: [profile({ modelId: 'gpt-rej', status: 'rejected', decidedAt: '2026-10-01T00:00:00Z' })] };
	const resolveAll = (defs: Record<string, any>) => {
		use(defs, store);
		const r = getModelRegistry();
		const out = settings.map(([tier, s]) => r.resolveTier(tier, s));
		_resetModelRegistryForTests();
		return out;
	};
	// The same values the pre-host resolveTier test asserts; no result names the host family.
	const withHostFamily = resolveAll(withHost());
	for (const res of withHostFamily) assert.notEqual(res.family, 'ollama-claude');
	assert.deepEqual(withHostFamily.map(x => x.fallback?.reason), [undefined, undefined, 'rejected-model', 'unlisted-model', 'unlisted-model', 'unlisted-model', undefined]);
	assert.deepEqual(withHostFamily.map(x => [x.family, x.model?.id, x.effort, x.droppedEffort]), [
		['cli-claude', 'claude-small', undefined, 'high'],
		['cli-codex', 'gpt-a', 'ultra', undefined],
		['cli-codex', 'gpt-b', undefined, undefined],
		['cli-codex', 'gpt-a', undefined, undefined],
		['cli-claude', 'claude-big', 'high', undefined],
		['cli-claude', 'claude-big', undefined, undefined],
		['ollama', 'qwen:1b', undefined, 'high'],
	]);
});

test('model-registry.test.ts: familyForClient returns cli-claude, cli-codex and cli-vibe as today', () => {
	// The host family listed BEFORE its vendor family, and a default whose CLI kind differs from the client.
	const defs = withHost();
	const host = defs.families.splice(3, 1)[0];
	defs.families.unshift(host);
	defs.defaultFamily = 'cli-codex';
	use(defs);
	const r = getModelRegistry();
	assert.equal(familyForClient('claude', r), 'cli-claude');
	assert.equal(familyForClient('codex', r), 'cli-codex');
	assert.equal(familyForClient('vibe', r), 'cli-vibe');
	assert.equal(familyForClient(undefined, r), undefined);
});

test("model-registry.test.ts: effortLevels over five families keeps today's levels and order", () => {
	use(baseline());
	const today = getModelRegistry().effortLevels();
	_resetModelRegistryForTests();
	const defs = withHost();
	defs.families[3].models[1].efforts = ['max', 'low'];
	use(defs);
	assert.deepEqual(getModelRegistry().effortLevels(), today, 'host efforts that add no new level leave the union as it was');
	assert.deepEqual(today, ['low', 'high', 'ultra', 'max']);
});

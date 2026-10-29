/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * models.definitions projection tests (Epic ce99b72065d03b1b, Story s2 · t1).
 *
 * The registry is built from a TEMP definitions dir and a TEMP approved-model
 * store; the Ollama lister is a fake. _resetModelRegistryForTests drops the
 * per-thread registry and file between tests.
 *
 * Run: npx tsx --test src/daemon/__tests__/model-definitions.test.ts
 */

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _setModelCatalogDirForTests, validateModelCatalog } from '../model-catalog.js';
import { getModelRegistry, _resetModelRegistryForTests, _setApprovedModelsPathForTests } from '../model-registry.js';
import { modelDefinitions, type ModelDefinitionsDeps } from '../model-definitions.js';

function fixture(): Record<string, unknown> {
	return {
		version: 3,
		defaultFamily: 'cli-codex',
		families: [
			{
				id: 'cli-claude', cliKind: 'claude', displayName: 'Claude',
				models: [
					{ id: 'claude-big', aliases: ['big'], displayName: 'Claude Big', efforts: ['low', 'high'], inputLimit: { unit: 'tokens', max: 200000 } },
					{ id: 'claude-small', efforts: ['low'] },
				],
				tierDefaults: { core: { model: 'big', effort: 'high' }, mid: { model: 'claude-big' }, cheap: { model: 'claude-small' } },
				summariserModel: 'claude-small',
			},
			{
				id: 'cli-codex', cliKind: 'codex', displayName: 'Codex',
				models: [{ id: 'gpt-a', efforts: ['low', 'ultra'] }, { id: 'gpt-shipped-later', efforts: ['low'] }],
				tierDefaults: { core: { model: 'gpt-a' }, mid: { model: 'gpt-a' }, cheap: { model: 'gpt-a' } },
				summariserModel: 'gpt-a',
			},
			{
				id: 'ollama', displayName: 'Ollama',
				models: [
					{ id: 'qwen:1b', aliases: ['qwen'], efforts: [], inputLimit: { unit: 'tokens', max: 8192 } },
					{ id: 'qwen3.6:27b', efforts: [], inputLimit: { unit: 'tokens', max: 32768 } },
				],
				toolLoopModel: 'qwen:1b',
			},
			{ id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama', models: [{ id: 'glm:cloud', efforts: ['low'], hosting: 'cloud' }] },
			{ id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe', models: [{ id: 'vibe-a', aliases: ['va'], efforts: ['low', 'max'] }], tierDefaults: { core: { model: 'va' }, mid: { model: 'vibe-a' }, cheap: { model: 'vibe-a' } }, summariserModel: 'vibe-a' }
		],
	};
}

const tmpDirs: string[] = [];
function tmp(): string { const d = mkdtempSync(join(tmpdir(), 'model-definitions-')); tmpDirs.push(d); return d; }

function use(store: unknown = null): void {
	const assets = tmp();
	writeFileSync(join(assets, 'cloud-model-catalog.json'), JSON.stringify(fixture()));
	const storeFile = join(tmp(), 'approved-models.json');
	if (store !== null) writeFileSync(storeFile, JSON.stringify(store));
	_setModelCatalogDirForTests(assets);
	_setApprovedModelsPathForTests(storeFile);
}

function deps(lister: () => Promise<readonly { id: string }[]>): ModelDefinitionsDeps {
	return { ollamaList: lister, registry: getModelRegistry, catalogVersion: () => validateModelCatalog().version };
}

afterEach(() => {
	_setModelCatalogDirForTests(undefined);
	_setApprovedModelsPathForTests(undefined);
	_resetModelRegistryForTests();
	for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test('model-definitions.test.ts: every sc3 field of a fixture file, aliases always a list, optional fields omitted', async () => {
	use();
	const r = await modelDefinitions(deps(async () => [{ id: 'qwen:1b' }]));
	assert.deepEqual(r, {
		version: 3,
		defaultFamily: 'cli-codex',
		families: [
			{
				id: 'cli-claude', cliKind: 'claude', displayName: 'Claude',
				tierDefaults: { core: { model: 'big', effort: 'high' }, mid: { model: 'claude-big' }, cheap: { model: 'claude-small' } },
				summariserModel: 'claude-small',
				rejectedModels: [],
				models: [
					{ id: 'claude-big', aliases: ['big'], displayName: 'Claude Big', efforts: ['low', 'high'], inputLimit: { unit: 'tokens', max: 200000 }, source: 'shipped' },
					{ id: 'claude-small', aliases: [], efforts: ['low'], source: 'shipped' },
				],
			},
			{
				id: 'cli-codex', cliKind: 'codex', displayName: 'Codex',
				tierDefaults: { core: { model: 'gpt-a' }, mid: { model: 'gpt-a' }, cheap: { model: 'gpt-a' } },
				summariserModel: 'gpt-a',
				rejectedModels: [],
				models: [
					{ id: 'gpt-a', aliases: [], efforts: ['low', 'ultra'], source: 'shipped' },
					{ id: 'gpt-shipped-later', aliases: [], efforts: ['low'], source: 'shipped' },
				],
			},
			{
				id: 'ollama', displayName: 'Ollama', toolLoopModel: 'qwen:1b',
				models: [
					{ id: 'qwen:1b', aliases: ['qwen'], efforts: [], inputLimit: { unit: 'tokens', max: 8192 }, source: 'shipped', installed: true },
					{ id: 'qwen3.6:27b', aliases: [], efforts: [], inputLimit: { unit: 'tokens', max: 32768 }, source: 'shipped', installed: false },
				],
			},
			{
				id: 'ollama-claude', cliKind: 'claude', displayName: 'Claude on Ollama', rejectedModels: [],
				models: [{ id: 'glm:cloud', aliases: [], efforts: ['low'], source: 'shipped' }],
			},
			{
				id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe',
				tierDefaults: { core: { model: 'va' }, mid: { model: 'vibe-a' }, cheap: { model: 'vibe-a' } },
				summariserModel: 'vibe-a',
				rejectedModels: [],
				models: [{ id: 'vibe-a', aliases: ['va'], efforts: ['low', 'max'], source: 'shipped' }],
			},
		],
	});
	// Optional fields are omitted, never present as undefined.
	const claudeSmall = r.families[0]!.models[1]!;
	assert.ok(!('displayName' in claudeSmall) && !('inputLimit' in claudeSmall) && !('installed' in claudeSmall));
	assert.ok(!('cliKind' in r.families[2]!) && !('rejectedModels' in r.families[2]!) && !('tierDefaults' in r.families[2]!));
});

test('model-definitions.test.ts: user-approved after shipped; unlisted rejected id only in rejectedModels; a rejected id the file lists is served as shipped and left out of rejectedModels', async () => {
	use({ version: 1, profiles: [
		{ family: 'cli-codex', modelId: 'gpt-new', status: 'approved', efforts: ['low', 'warp'], inputLimit: { unit: 'tokens', max: 400000 }, decidedAt: '2026-10-01T00:00:00Z', cliVersion: '0.164.0' },
		{ family: 'cli-codex', modelId: 'gpt-gone', status: 'rejected', efforts: [], decidedAt: '2026-10-02T00:00:00Z', cliVersion: '0.164.0' },
		{ family: 'cli-codex', modelId: 'gpt-shipped-later', status: 'rejected', efforts: [], decidedAt: '2026-10-03T00:00:00Z', cliVersion: '0.164.0' },
	] });
	const r = await modelDefinitions(deps(async () => []));
	const codex = r.families.find(f => f.id === 'cli-codex')!;
	assert.deepEqual(codex.models.map(m => [m.id, m.source]), [
		['gpt-a', 'shipped'], ['gpt-shipped-later', 'shipped'], ['gpt-new', 'user-approved'],
	]);
	assert.deepEqual(codex.models[2], { id: 'gpt-new', aliases: [], efforts: ['low', 'warp'], inputLimit: { unit: 'tokens', max: 400000 }, source: 'user-approved' });
	assert.deepEqual(codex.rejectedModels, ['gpt-gone']);
	assert.ok(!codex.models.some(m => m.id === 'gpt-gone'));
});

test('model-definitions.test.ts: installed exact-match true/false, absent when the lister rejects, unlisted installed models absent', async () => {
	use();
	const answered = await modelDefinitions(deps(async () => [{ id: 'qwen:1b' }, { id: 'qwen3.6:latest' }, { id: 'llama3:8b' }]));
	const ollama = answered.families.find(f => f.id === 'ollama')!;
	assert.deepEqual(ollama.models.map(m => [m.id, m.installed]), [['qwen:1b', true], ['qwen3.6:27b', false]]);
	assert.ok(!ollama.models.some(m => m.id === 'llama3:8b' || m.id === 'qwen3.6:latest'), 'installed but unlisted models never appear');
	// CLI models never carry installed.
	for (const f of answered.families.filter(x => x.id !== 'ollama')) assert.ok(f.models.every(m => !('installed' in m)));

	let calls = 0;
	const down = await modelDefinitions(deps(async () => { calls++; throw new Error('ollama model list timed out after 4000ms'); }));
	assert.equal(calls, 1, 'one listing call');
	const ollamaDown = down.families.find(f => f.id === 'ollama')!;
	assert.equal(ollamaDown.models.length, 2, 'the request still succeeds with every listed model');
	assert.ok(ollamaDown.models.every(m => !('installed' in m)));
});

test('model-definitions.test.ts: models.definitions carries memoryMb for an Ollama model that has it', async () => {
	const assets = tmp();
	const f = fixture() as { families: Array<{ id: string; models: Array<Record<string, unknown>> }> };
	f.families.find(x => x.id === 'ollama')!.models[0]!['memoryMb'] = 1200;
	writeFileSync(join(assets, 'cloud-model-catalog.json'), JSON.stringify(f));
	_setModelCatalogDirForTests(assets);
	_setApprovedModelsPathForTests(join(tmp(), 'approved-models.json'));
	const r = await modelDefinitions(deps(async () => []));
	const models = r.families.find(x => x.id === 'ollama')!.models;
	assert.equal(models[0]!.memoryMb, 1200);
	assert.ok(!('memoryMb' in models[1]!), 'omitted when the definitions do not give it');
	for (const fam of r.families.filter(x => x.id !== 'ollama')) for (const m of fam.models) assert.ok(!('memoryMb' in m));
});

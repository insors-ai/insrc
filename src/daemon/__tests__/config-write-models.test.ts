/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The model rules of `config.write` (Epic ce99b72065d03b1b, Story s3 · t7):
 * a write that leaves a tier naming a model the user rejected (and the family
 * does not serve) is refused with config.json unchanged, however the write
 * reaches the tier; an accepted write reports restartRequired when a
 * restart-sensitive model setting changed.
 *
 * The real `config.write` handler runs in a temp HOME over a fixture
 * definitions file and approved-model store.
 *
 * Run: npx tsx --test src/daemon/__tests__/config-write-models.test.ts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-config-write-models-'));
process.env['HOME'] = HOME;
const { PATHS } = await import('../../shared/paths.js');
const { buildHandlerRuntime } = await import('../handler-runtime.js');
const { _setModelCatalogDirForTests } = await import('../model-catalog.js');
const { _resetModelRegistryForTests, _setApprovedModelsPathForTests } = await import('../model-registry.js');

const FIXTURE = {
	version: 1,
	defaultFamily: 'cli-claude',
	families: [
		{
			id: 'cli-claude', cliKind: 'claude', displayName: 'Claude',
			// claude-back was rejected by the user once; this file lists it again (id and alias).
			models: [{ id: 'claude-a', efforts: [] }, { id: 'claude-back', aliases: ['back'], efforts: [] }],
			tierDefaults: { core: { model: 'claude-a' }, mid: { model: 'claude-a' }, cheap: { model: 'claude-a' } },
			summariserModel: 'claude-a',
		},
		{
			id: 'cli-codex', cliKind: 'codex', displayName: 'Codex',
			models: [{ id: 'gpt-x', efforts: [] }],
			tierDefaults: { core: { model: 'gpt-x' }, mid: { model: 'gpt-x' }, cheap: { model: 'gpt-x' } },
			summariserModel: 'gpt-x',
		},
		{ id: 'ollama', displayName: 'O', models: [{ id: 'o:1', efforts: [], inputLimit: { unit: 'tokens', max: 4096 } }], toolLoopModel: 'o:1' },
		{ id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama', models: [{ id: 'glm:cloud', efforts: ['low'], hosting: 'cloud' }] },
		{ id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe', models: [{ id: 'vibe-a', aliases: ['va'], efforts: ['low', 'max'] }], tierDefaults: { core: { model: 'va' }, mid: { model: 'vibe-a' }, cheap: { model: 'vibe-a' } }, summariserModel: 'vibe-a' }
	],
};

/** The config the tests start from. */
const BASE = {
	logLevel: 'info',
	models: {
		tiers: {
			core:  { runner: 'cli-codex',  model: 'gpt-x',    effort: '' },
			mid:   { runner: 'cli-claude', model: 'gpt-gone', effort: '' },   // unlisted for claude, not rejected there
			cheap: { runner: 'cli-claude', model: 'claude-a', effort: '' },
		},
		tasks: { 'tracker.render': 'cheap' },
		coreFloor: 'mid',
		local: { host: 'http://localhost:11434', coreModel: 'o:1' },
		shaper: { maxToolTurns: 40 },
	},
};

type Write = (params: unknown) => Promise<unknown>;
let write: Write;

before(() => {
	const assets = join(HOME, 'assets');
	mkdirSync(assets, { recursive: true });
	writeFileSync(join(assets, 'cloud-model-catalog.json'), JSON.stringify(FIXTURE));
	const store = join(HOME, 'approved-models.json');
	writeFileSync(store, JSON.stringify({ version: 1, profiles: [
		{ family: 'cli-codex', modelId: 'gpt-gone', status: 'rejected', efforts: [], decidedAt: '2026-10-01T00:00:00Z', cliVersion: '0.1.0' },
		{ family: 'cli-claude', modelId: 'claude-back', status: 'rejected', efforts: [], decidedAt: '2026-10-01T00:00:00Z', cliVersion: '1.0.0' },
	] }));
	_setModelCatalogDirForTests(assets);
	_setApprovedModelsPathForTests(store);
	_resetModelRegistryForTests();
	const untouchable = (name: string): never => new Proxy({}, { get: (_t, prop) => { throw new Error(`config.write read ${name}.${String(prop)}`); } }) as never;
	const runtime = buildHandlerRuntime({
		db: untouchable('db'), configStore: untouchable('configStore'), queue: untouchable('queue'), indexer: untouchable('indexer'),
		startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
	});
	write = runtime.rpcHandlers['config.write'] as Write;
	mkdirSync(dirname(PATHS.config), { recursive: true });
});
after(() => {
	_setModelCatalogDirForTests(undefined);
	_setApprovedModelsPathForTests(undefined);
	_resetModelRegistryForTests();
	rmSync(HOME, { recursive: true, force: true });
});

function reset(): string {
	const text = JSON.stringify(BASE, null, 2);
	writeFileSync(PATHS.config, text);
	return text;
}

test('config-write-models.test.ts: refusal via model leaf, runner switch, whole-tier and parent-object writes with config.json unchanged; formerly rejected shipped model accepted by id and alias', async () => {
	const refusals: Array<[string, unknown, unknown]> = [
		['model leaf', ['models', 'tiers', 'core', 'model'], 'gpt-gone'],
		['runner switch', 'models.tiers.mid.runner', 'cli-codex'],                       // mid already names gpt-gone
		['whole tier', 'models.tiers.cheap', { runner: 'cli-codex', model: 'gpt-gone', effort: '' }],
		['parent object', 'models', { ...BASE.models, tiers: { ...BASE.models.tiers, cheap: { runner: 'cli-codex', model: 'gpt-gone' } } }],
	];
	for (const [label, path, value] of refusals) {
		const before = reset();
		const r = await write({ path, value }) as { ok: boolean; reason?: string | undefined; detail?: string | undefined };
		assert.equal(r.ok, false, label);
		assert.equal(r.reason, 'rejected-model', label);
		assert.match(r.detail ?? '', /'gpt-gone' is rejected in cli-codex/, label);
		assert.equal(readFileSync(PATHS.config, 'utf8'), before, `${label}: config.json unchanged`);
	}

	// A write that does not change a tier's runner or model is not refused for a tier left as it was.
	reset();
	assert.equal((await write({ path: 'logLevel', value: 'debug' }) as { ok: boolean }).ok, true);

	// A model the user rejected that the definitions file now lists again is accepted, by id and by alias.
	for (const model of ['claude-back', 'back']) {
		reset();
		const r = await write({ path: ['models', 'tiers', 'cheap', 'model'], value: model }) as { ok: boolean };
		assert.equal(r.ok, true, model);
		const written = JSON.parse(readFileSync(PATHS.config, 'utf8')) as typeof BASE;
		assert.equal(written.models.tiers.cheap.model, model);
	}

	// An invalid path is refused as before.
	reset();
	assert.deepEqual(Object.keys(await write({ path: '', value: 1 }) as object).sort(), ['detail', 'ok', 'reason']);
	assert.ok(existsSync(PATHS.config));
});

test("config-write-models.test.ts: restartRequired for tier, tasks, coreFloor and coreModel changes including 'models' and 'models.local' writes; none for unrelated writes", async () => {
	const restart: Array<[string, unknown, unknown]> = [
		['tier model', 'models.tiers.core.model', 'gpt-x-2'],
		['tier effort', ['models', 'tiers', 'core', 'effort'], 'high'],
		['tasks', ['models', 'tasks', 'tracker.render'], 'mid'],
		['coreFloor', 'models.coreFloor', 'core'],
		['coreModel', 'models.local.coreModel', 'o:2'],
		['parent models', 'models', { ...BASE.models, coreFloor: 'core' }],
		['parent models.local', 'models.local', { host: 'http://localhost:11434', coreModel: 'o:2' }],
		['byRepo', ['models', 'byRepo', '/w/repo'], { tasks: { 'tracker.render': 'core' } }],
	];
	for (const [label, path, value] of restart) {
		reset();
		assert.deepEqual(await write({ path, value }), { ok: true, restartRequired: true }, label);
	}
	const none: Array<[string, unknown, unknown]> = [
		['logLevel', 'logLevel', 'debug'],
		['shaper knob', 'models.shaper.maxToolTurns', 12],
		['models.local host only', 'models.local', { host: 'http://other:11434', coreModel: 'o:1' }],
		['the same tier value', 'models.tiers.core.model', 'gpt-x'],
	];
	for (const [label, path, value] of none) {
		reset();
		assert.deepEqual(await write({ path, value }), { ok: true }, label);
	}
});

test("config-write-models.test.ts: writes adding or changing models.byRepo.<repo>.tiers (directly or through a parent object) are refused with 'per-repo-tier'; tasks / coreFloor and unrelated writes succeed", async () => {
	const tier = { runner: 'cli-codex', model: 'gpt-x', effort: '' };
	const refusals: Array<[string, unknown, unknown, RegExp]> = [
		['tier leaf', ['models', 'byRepo', '/w/repo', 'tiers', 'core', 'model'], 'gpt-x', /refused: models\.byRepo\.\/w\/repo\.tiers$/],
		['byRepo object', ['models', 'byRepo'], { '/w/repo': { tasks: { 'tracker.render': 'mid' }, tiers: { core: tier } } }, /refused: models\.byRepo\.\/w\/repo\.tiers$/],
		['models object', ['models'], { ...BASE.models, byRepo: { '/w/a': { tiers: { mid: tier } }, '/w/b': { tiers: { cheap: tier } } } }, /refused: models\.byRepo\.\/w\/a\.tiers, models\.byRepo\.\/w\/b\.tiers$/],
	];
	for (const [label, path, value, detail] of refusals) {
		const before = reset();
		const r = await write({ path, value }) as { ok: boolean; reason?: string | undefined; detail?: string | undefined };
		assert.equal(r.ok, false, label);
		assert.equal(r.reason, 'per-repo-tier', label);
		assert.match(r.detail ?? '', /^tiers are global \(models\.tiers\); per-repo settings take only tasks and coreFloor/, label);
		assert.match(r.detail ?? '', detail, label);
		assert.equal(readFileSync(PATHS.config, 'utf8'), before, `${label}: config.json unchanged`);
	}

	// tasks and coreFloor under a repo stay writable.
	reset();
	assert.equal((await write({ path: ['models', 'byRepo', '/w/repo', 'tasks'], value: { 'tracker.render': 'core' } }) as { ok: boolean }).ok, true);
	assert.equal((await write({ path: ['models', 'byRepo', '/w/repo', 'coreFloor'], value: 'core' }) as { ok: boolean }).ok, true);
	const written = JSON.parse(readFileSync(PATHS.config, 'utf8')) as { models: { byRepo: Record<string, unknown> } };
	assert.deepEqual(written.models.byRepo['/w/repo'], { tasks: { 'tracker.render': 'core' }, coreFloor: 'core' });

	// A config that already holds a per-repo tier (pruned at the next boot) still takes unrelated writes, and removing the tier is accepted.
	const withLegacy = { ...BASE, models: { ...BASE.models, byRepo: { '/w/old': { tasks: {}, tiers: { core: tier } } } } };
	writeFileSync(PATHS.config, JSON.stringify(withLegacy, null, 2));
	// Changing an existing per-repo tier — its leaf, the whole tier, or through the byRepo parent — is refused, config.json unchanged.
	const changes: Array<[string, unknown, unknown]> = [
		['existing tier leaf', ['models', 'byRepo', '/w/old', 'tiers', 'core', 'model'], 'gpt-y'],
		['existing whole tier', ['models', 'byRepo', '/w/old', 'tiers', 'core'], { ...tier, effort: 'high' }],
		['existing via byRepo', ['models', 'byRepo'], { '/w/old': { tasks: {}, tiers: { core: { ...tier, model: 'gpt-y' } } } }],
	];
	for (const [label, path, value] of changes) {
		const before = readFileSync(PATHS.config, 'utf8');
		const r = await write({ path, value }) as { ok: boolean; reason?: string | undefined; detail?: string | undefined };
		assert.equal(r.ok, false, label);
		assert.equal(r.reason, 'per-repo-tier', label);
		assert.match(r.detail ?? '', /refused: models\.byRepo\.\/w\/old\.tiers$/, label);
		assert.equal(readFileSync(PATHS.config, 'utf8'), before, `${label}: config.json unchanged`);
	}
	assert.equal((await write({ path: 'logLevel', value: 'debug' }) as { ok: boolean }).ok, true);
	assert.equal((await write({ path: ['models', 'byRepo', '/w/old', 'coreFloor'], value: 'mid' }) as { ok: boolean }).ok, true);
	assert.equal((await write({ path: ['models', 'byRepo', '/w/old', 'tiers'], value: null }) as { ok: boolean }).ok, true);
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `claude.models` answers from the model definitions (Epic ce99b72065d03b1b,
 * Story s3 · t6): the served models of the family the claude CLI runs, in the
 * RPC's existing `{ id, displayName, createdAt }` shape, with no cloud REST
 * call (DEF k1) — also when an ANTHROPIC_API_KEY is stored.
 *
 * The real handler is called from the built handler table in a temp HOME; any
 * network use fails the test.
 *
 * Run: npx tsx --test src/daemon/__tests__/claude-models.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import https from 'node:https';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-claude-models-'));
process.env['HOME'] = HOME;
process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test-not-a-real-key';
const { buildHandlerRuntime } = await import('../handler-runtime.js');
const { _setModelCatalogDirForTests } = await import('../model-catalog.js');
const { _resetModelRegistryForTests, _setApprovedModelsPathForTests } = await import('../model-registry.js');

const HERE = dirname(fileURLToPath(import.meta.url));

function untouchable(name: string): never {
	return new Proxy({}, { get: (_t, prop) => { throw new Error(`claude.models read ${name}.${String(prop)}`); } }) as never;
}

test('claude-models.test.ts: claude.models lists the Claude-kind family in its shape with no network call even with ANTHROPIC_API_KEY set; no @anthropic-ai/sdk import in handler-runtime.ts', async () => {
	// The claude CLI runs the cli-codex family here, so the answer can only have come from the definitions.
	const assets = join(HOME, 'assets');
	mkdirSync(assets, { recursive: true });
	writeFileSync(join(assets, 'cloud-model-catalog.json'), JSON.stringify({
		version: 1,
		defaultFamily: 'cli-claude',
		families: [
			{ id: 'cli-claude', cliKind: 'codex', displayName: 'A', models: [{ id: 'a', efforts: [] }], tierDefaults: { core: { model: 'a' }, mid: { model: 'a' }, cheap: { model: 'a' } }, summariserModel: 'a' },
			{ id: 'cli-codex', cliKind: 'claude', displayName: 'B', models: [{ id: 'b-1', displayName: 'Bee One', efforts: [] }, { id: 'b-2', efforts: [] }], tierDefaults: { core: { model: 'b-1' }, mid: { model: 'b-1' }, cheap: { model: 'b-2' } }, summariserModel: 'b-2' },
			{ id: 'ollama', displayName: 'O', models: [{ id: 'o:1', efforts: [], inputLimit: { unit: 'tokens', max: 4096 } }], toolLoopModel: 'o:1' },
			{ id: 'ollama-claude', cliKind: 'claude', host: 'ollama', displayName: 'Claude on Ollama', models: [{ id: 'glm:cloud', efforts: ['low'], hosting: 'cloud' }] },
			{ id: 'cli-vibe', cliKind: 'vibe', displayName: 'Vibe', models: [{ id: 'vibe-a', aliases: ['va'], efforts: ['low', 'max'] }], tierDefaults: { core: { model: 'va' }, mid: { model: 'vibe-a' }, cheap: { model: 'vibe-a' } }, summariserModel: 'vibe-a' }
		],
	}));
	// One user-approved model of that family is served too.
	const store = join(HOME, 'approved-models.json');
	writeFileSync(store, JSON.stringify({ version: 1, profiles: [
		{ family: 'cli-codex', modelId: 'b-new', status: 'approved', efforts: [], decidedAt: '2026-10-01T00:00:00Z', cliVersion: '1.0.0' },
	] }));
	_setModelCatalogDirForTests(assets);
	_setApprovedModelsPathForTests(store);
	_resetModelRegistryForTests();

	const realFetch = globalThis.fetch;
	const netCalls: string[] = [];
	globalThis.fetch = (async (url: unknown) => { netCalls.push(String(url)); throw new Error('network'); }) as typeof fetch;
	const realHttp = http.request, realHttps = https.request;
	(http as { request: unknown }).request = (...a: unknown[]) => { netCalls.push(`http ${String(a[0])}`); throw new Error('network'); };
	(https as { request: unknown }).request = (...a: unknown[]) => { netCalls.push(`https ${String(a[0])}`); throw new Error('network'); };
	try {
		const runtime = buildHandlerRuntime({
			db: untouchable('db'), configStore: untouchable('configStore'), queue: untouchable('queue'), indexer: untouchable('indexer'),
			startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
		});
		const models = await runtime.rpcHandlers['claude.models']!(undefined);
		assert.deepEqual(models, [
			{ id: 'b-1', displayName: 'Bee One', createdAt: '' },
			{ id: 'b-2', displayName: 'b-2', createdAt: '' },
			{ id: 'b-new', displayName: 'b-new', createdAt: '' },
		]);
		assert.deepEqual(netCalls, [], 'no network call');
	} finally {
		globalThis.fetch = realFetch;
		(http as { request: unknown }).request = realHttp;
		(https as { request: unknown }).request = realHttps;
		_setModelCatalogDirForTests(undefined);
		_setApprovedModelsPathForTests(undefined);
		_resetModelRegistryForTests();
		rmSync(HOME, { recursive: true, force: true });
	}

	const runtimeSrc = readFileSync(join(HERE, '..', 'handler-runtime.ts'), 'utf8');
	assert.doesNotMatch(runtimeSrc, /@anthropic-ai\/sdk/);
	assert.match(runtimeSrc, /'claude\.models': async \(\) => claudeModels\(\)/);
});

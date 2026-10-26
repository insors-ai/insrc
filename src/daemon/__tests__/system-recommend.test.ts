/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's system.recommend (Epic ce99b72065d03b1b, Story s5 · t5)
 * recommends the definitions' tool-loop model, with its memory estimate — a
 * fixture file whose tool-loop model differs from the shipped one proves the
 * answer comes from the definitions.
 *
 * Run: npx tsx --test src/daemon/__tests__/system-recommend.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-system-recommend-'));
process.env['HOME'] = HOME;
const { buildHandlerRuntime } = await import('../handler-runtime.js');
const { MODEL_CATALOG_DIR, _setModelCatalogDirForTests } = await import('../model-catalog.js');
const { _resetModelRegistryForTests, _setApprovedModelsPathForTests } = await import('../model-registry.js');

test("system-recommend.test.ts: the daemon's system.recommend recommends a fixture file's tool-loop model", async () => {
	const assets = mkdtempSync(join(tmpdir(), 'insrc-system-recommend-assets-'));
	try {
		const defs = JSON.parse(readFileSync(join(MODEL_CATALOG_DIR, 'cloud-model-catalog.json'), 'utf8')) as { families: Array<{ id: string; models: unknown[]; toolLoopModel?: string }> };
		const ollama = defs.families.find(f => f.id === 'ollama')!;
		ollama.models.push({ id: 'fixture-local:3b', efforts: [], inputLimit: { unit: 'tokens', max: 8192 }, memoryMb: 3000 });
		ollama.toolLoopModel = 'fixture-local:3b';
		writeFileSync(join(assets, 'cloud-model-catalog.json'), JSON.stringify(defs));
		_setModelCatalogDirForTests(assets);
		_setApprovedModelsPathForTests(join(assets, 'approved-models.json'));
		_resetModelRegistryForTests();

		const none = (name: string): never => new Proxy({}, { get: (_t, p) => { throw new Error(`read ${name}.${String(p)}`); } }) as never;
		const runtime = buildHandlerRuntime({
			db: none('db'), configStore: none('configStore'), queue: none('queue'), indexer: none('indexer'),
			startedAt: 0, shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
		});
		const r = await runtime.rpcHandlers['system.recommend']!({}) as { recommendation: { coder: { model: string; vramNeeded: number } }; config: { models: { local: { coreModel: string } } } };
		assert.equal(r.recommendation.coder.model, 'fixture-local:3b');
		assert.equal(r.recommendation.coder.vramNeeded, 3000);
		assert.equal(r.config.models.local.coreModel, 'fixture-local:3b');
	} finally {
		_setModelCatalogDirForTests(undefined);
		_setApprovedModelsPathForTests(undefined);
		_resetModelRegistryForTests();
		rmSync(assets, { recursive: true, force: true });
		rmSync(HOME, { recursive: true, force: true });
	}
});

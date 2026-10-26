/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Every daemon worker loads and validates its own model registry when it
 * starts (Epic ce99b72065d03b1b, Story s1 · t3). Real worker threads are
 * pointed at a TEMP copy of the definitions asset through the test-only
 * INSRC_MODEL_CATALOG_DIR environment value (workers do not see the in-process
 * override) and at a temp home for the approved-model store.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/worker-model-registry.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, Worker } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-worker-registry-'));
process.env['HOME'] = HOME;

const { MODEL_CATALOG_DIR, _setModelCatalogDirForTests } = await import('../../model-catalog.js');
const { getModelRegistry, _resetModelRegistryForTests, _setApprovedModelsPathForTests } = await import('../../model-registry.js');
const { createStoreGuardBlock } = await import('../../../db/store-guard.js');
const { createLockBlock } = await import('../../../shared/locks/lock-manager.js');
const { serveHub } = await import('../channel.js');
const { LocalStepStateStore, stepStateHubHandlers } = await import('../step-state.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG = 'cloud-model-catalog.json';
const guardBlock = createStoreGuardBlock();
const lockBlock = createLockBlock();
const workers: Worker[] = [];
const tmpDirs: string[] = [HOME];

after(async () => {
	for (const w of workers) await w.terminate();
	_setModelCatalogDirForTests(undefined);
	_setApprovedModelsPathForTests(undefined);
	_resetModelRegistryForTests();
	for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

/** A temp copy of the shipped asset dir. */
function assetCopy(): string {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-worker-models-'));
	tmpDirs.push(dir);
	cpSync(join(MODEL_CATALOG_DIR, CATALOG), join(dir, CATALOG));
	return dir;
}

type Outcome = ({ op: 'ready'; codex: string[]; ollama: string[] } | { op: 'failed'; error: Error }) & { started: boolean };

/** Start a registry worker with the asset dir in its environment; resolve with its first outcome. */
function startWorker(assetDir: string): Promise<Outcome> {
	const { port1, port2 } = new MessageChannel();
	serveHub(port1, stepStateHubHandlers(new LocalStepStateStore()));
	const worker = new Worker(join(HERE, 'helpers', 'registry-worker.ts'), {
		workerData: { guardBlock, lockBlock, hubPort: port2 },
		transferList: [port2],
		env: { ...process.env, HOME, INSRC_MODEL_CATALOG_DIR: assetDir },
	});
	workers.push(worker);
	let started = false;
	return new Promise(resolve => {
		worker.on('message', (m: { op: string; codex?: string[]; ollama?: string[] }) => {
			if (m.op === 'started') started = true;
			else resolve({ ...(m as { op: 'ready'; codex: string[]; ollama: string[] }), started });
		});
		worker.once('error', error => resolve({ op: 'failed', error, started }));
	});
}

test('worker-model-registry.test.ts: a worker started with INSRC_MODEL_CATALOG_DIR pointing at a corrupted copy fails its start with ModelCatalogValidationError', async () => {
	const dir = assetCopy();
	const file = JSON.parse(readFileSync(join(dir, CATALOG), 'utf8')) as { families: Array<{ id: string; tierDefaults?: Record<string, { model: string }> }> };
	file.families[1]!.tierDefaults!['mid']!.model = 'gpt-9';
	writeFileSync(join(dir, CATALOG), JSON.stringify(file));

	const outcome = await startWorker(dir);
	assert.equal(outcome.op, 'failed', JSON.stringify(outcome));
	assert.equal(outcome.started, false, 'the throw came from inside startDaemonWorker');
	const { error } = outcome as { error: Error };
	assert.equal(error.name, 'ModelCatalogValidationError');
	assert.match(error.message, /families\[1\] \(cli-codex\): tierDefaults\.mid\.model 'gpt-9' is not a model or alias of cli-codex/);
	assert.ok(error.message.includes(join(dir, CATALOG)), 'names the file');
});

test('worker-model-registry.test.ts: a worker started after the asset copy and store changed reports the new models while the main thread\'s registry keeps the old ones', async () => {
	const dir = assetCopy();
	const storeFile = join(HOME, '.insrc', 'approved-models.json');
	mkdirSync(dirname(storeFile), { recursive: true });
	_setModelCatalogDirForTests(dir);
	_setApprovedModelsPathForTests(storeFile);
	const mainBefore = getModelRegistry().models('cli-codex').map(m => m.id);
	assert.ok(!mainBefore.includes('gpt-new-shipped') && !mainBefore.includes('gpt-new-approved'));

	// Change the asset and the store on disk after the main thread loaded its registry.
	const file = JSON.parse(readFileSync(join(dir, CATALOG), 'utf8')) as { families: Array<{ models: unknown[] }> };
	file.families[1]!.models.push({ id: 'gpt-new-shipped', efforts: ['low'] });
	writeFileSync(join(dir, CATALOG), JSON.stringify(file));
	writeFileSync(storeFile, JSON.stringify({ version: 1, profiles: [{
		family: 'cli-codex', modelId: 'gpt-new-approved', status: 'approved', efforts: ['low'],
		decidedAt: '2026-10-25T00:00:00Z', cliVersion: '0.164.0',
	}] }));

	const outcome = await startWorker(dir);
	assert.equal(outcome.op, 'ready', JSON.stringify(outcome));
	assert.equal(outcome.started, true);
	const { codex } = outcome as { codex: string[] };
	assert.deepEqual(codex, [...mainBefore, 'gpt-new-shipped', 'gpt-new-approved']);
	// The main thread's cached registry keeps the old contents.
	assert.deepEqual(getModelRegistry().models('cli-codex').map(m => m.id), mainBefore);
});

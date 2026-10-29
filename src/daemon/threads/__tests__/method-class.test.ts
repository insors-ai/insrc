/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Method-class registry (Epic 86197ac6, Story s2, t2, contract sc5): every
 * served method has a class, the table equals the handler tables the daemon
 * builds, and the module loads on a worker without a handler module.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/method-class.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-method-class-'));
process.env['HOME'] = HOME;
const { methodClasses } = await import('../method-class.js');
const { buildHandlerRuntime } = await import('../../handler-runtime.js');

const HERE = dirname(fileURLToPath(import.meta.url));

const ADMIN = ['daemon.status', 'daemon.debug-status', 'daemon.shutdown', 'daemon.update', 'daemon.updateOutcome',
	'repo.list', 'config.show', 'config.catalog', 'guide.list', 'guide.get'];
const INDEXING = ['repo.add', 'repo.remove', 'repo.reindex', 'repo.stats', 'index.file',
	'config.enqueue', 'config.reindex', 'daemon.compact', 'daemon.backup', 'docSummary.restoreFromBackup'];

/** The methods the daemon serves: the tables buildHandlerRuntime constructs, after every merge. */
function servedTables(): { rpc: string[]; stream: string[] } {
	const none = {} as never;
	const runtime = buildHandlerRuntime({
		db: none, configStore: none, queue: none, indexer: none, startedAt: 0,
		shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
	});
	return { rpc: Object.keys(runtime.rpcHandlers), stream: Object.keys(runtime.streamHandlers) };
}

/** Where the registry and the served tables differ: methods with no entry, and entries for no served method or with the wrong stream flag. */
function differences(tables: { rpc: string[]; stream: string[] }): { missing: string[]; stale: string[] } {
	const served = new Map<string, boolean>([...tables.rpc.map(m => [m, false] as const), ...tables.stream.map(m => [m, true] as const)]);
	const entries = methodClasses.entries();
	const missing = [...served.keys()].filter(m => !entries.some(e => e.method === m)).sort();
	const stale = entries.filter(e => served.get(e.method) !== e.stream).map(e => e.method).sort();
	return { missing, stale };
}

test('classOf/entries: the ten admin and ten indexing methods have their class, every other entry is session, entries unique', () => {
	for (const m of ADMIN) assert.equal(methodClasses.classOf(m), 'admin', m);
	for (const m of INDEXING) assert.equal(methodClasses.classOf(m), 'indexing', m);
	const entries = methodClasses.entries();
	assert.deepEqual(entries.filter(e => e.cls === 'admin').map(e => e.method).sort(), [...ADMIN].sort());
	assert.deepEqual(entries.filter(e => e.cls === 'indexing').map(e => e.method).sort(), [...INDEXING].sort());
	assert.ok(entries.filter(e => e.cls !== 'admin' && e.cls !== 'indexing').every(e => e.cls === 'session'));
	assert.equal(new Set(entries.map(e => e.method)).size, entries.length, 'no method listed twice');
	assert.equal(methodClasses.classOf('step.call'), 'session');
	assert.equal(methodClasses.classOf('no.such.method'), undefined);
	assert.ok(Object.isFrozen(entries) && Object.isFrozen(entries[0]), 'the table is frozen');
});

test('tools.call is classed session and stream, and equals the handler table', () => {
	const entry = methodClasses.entries().find(e => e.method === 'tools.call');
	assert.deepEqual(entry, { method: 'tools.call', cls: 'session', stream: true });
	assert.equal(methodClasses.classOf('tools.call'), 'session');
});

test('coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry', () => {
	try {
		const tables = servedTables();
		assert.ok(tables.rpc.includes('daemon.update') && tables.rpc.includes('understanding.list') && tables.stream.includes('understanding.watch'),
			'the tables include the update-handler spread and the understanding routes');
		assert.deepEqual(differences(tables), { missing: [], stale: [] });
		// The comparison catches both kinds of drift.
		const drifted = { rpc: [...tables.rpc.filter(m => m !== 'repo.list'), 'repo.brandNew'], stream: tables.stream };
		assert.deepEqual(differences(drifted), { missing: ['repo.brandNew'], stale: ['repo.list'] });
		const flipped = { rpc: [...tables.rpc, 'step.call'], stream: tables.stream.filter(m => m !== 'step.call') };
		assert.deepEqual(differences(flipped).stale, ['step.call'], 'a wrong stream flag is stale');
	} finally {
		rmSync(HOME, { recursive: true, force: true });
	}
});

test('the method-class module loads on a worker without importing a handler module', async () => {
	// Its only import is type-only, which is erased at run time.
	const src = readFileSync(join(HERE, '..', 'method-class.ts'), 'utf8');
	const imports = [...src.matchAll(/^import\s+(type\s+)?[^;]*;/gm)];
	assert.ok(imports.length > 0 && imports.every(m => m[1] !== undefined), `only type imports: ${imports.map(m => m[0]).join(' | ')}`);
	assert.doesNotMatch(src, /import\(/, 'no dynamic import');

	const worker = new Worker(join(HERE, 'helpers', 'method-class-worker-bootstrap.mjs'));
	const reply = await new Promise<unknown>((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
	await worker.terminate();
	assert.deepEqual(reply, { status: 'admin', reindex: 'indexing', step: 'session', entries: methodClasses.entries().length });
});

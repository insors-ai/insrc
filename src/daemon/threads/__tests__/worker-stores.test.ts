/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Daemon workers and the stores (Epic 86197ac6, Story s1, t10): a worker
 * started with startDaemonWorker uses the live LMDB and Lance stores beside
 * the main thread; a thread that never declared the owner is refused.
 *
 * The home directory is pointed at a temporary one BEFORE any store module is
 * imported, so "the live stores" here are paths inside that home, and every
 * worker inherits it.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/worker-stores.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, Worker } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-worker-stores-'));
process.env['HOME'] = HOME;

const { PATHS } = await import('../../../shared/paths.js');
const {
	closeGraphStore, declareLiveStoreOwner, getGraphStore, getGraphStorePath, isLiveStoreOwnerDeclared, resetLiveStoreDeclarationsForTests,
} = await import('../../../db/graph/store.js');
const { closeLanceConn, getLanceConn, getLanceConnPath } = await import('../../../db/lance/conn.js');
const { createStoreGuardBlock, installStoreGuard } = await import('../../../db/store-guard.js');
const { addRepo } = await import('../../../db/repos.js');
const { serveHub } = await import('../channel.js');
const { LocalStepStateStore, stepStateHubHandlers } = await import('../step-state.js');
const { NotADaemonWorkerError, startDaemonWorker } = await import('../worker-entry.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = '/repo/worker-stores';
const guardBlock = createStoreGuardBlock();
const steps = new LocalStepStateStore();
const workers: Worker[] = [];

type Reply = Record<string, unknown> & { op: string; ok: boolean };

/** A worker of the script in helpers/store-worker.ts, with an ordered inbox. */
interface ScriptedWorker {
	run(message: Record<string, unknown>): Promise<Reply>;
}

async function spawn(declare: boolean): Promise<ScriptedWorker> {
	const { port1, port2 } = new MessageChannel();
	serveHub(port1, stepStateHubHandlers(steps));
	const worker = new Worker(join(HERE, 'helpers', 'store-worker.ts'), {
		workerData: declare ? { declare, guardBlock, hubPort: port2 } : { declare },
		transferList: declare ? [port2] : [],
	});
	workers.push(worker);
	const inbox: Reply[] = [];
	const waiting: ((m: Reply) => void)[] = [];
	worker.on('message', (m: Reply) => { const w = waiting.shift(); if (w !== undefined) w(m); else inbox.push(m); });
	worker.on('error', e => { const w = waiting.shift(); if (w !== undefined) w({ op: 'error', ok: false, message: e.message }); });
	const next = (): Promise<Reply> => { const m = inbox.shift(); return m !== undefined ? Promise.resolve(m) : new Promise(res => { waiting.push(res); }); };
	const ready = await next();
	assert.equal(ready.op, 'ready', JSON.stringify(ready));
	return { run: (message) => { worker.postMessage(message); return next(); } };
}

before(async () => {
	assert.equal(PATHS.lmdb, join(HOME, '.insrc', 'graph.lmdb'), 'the live store is inside the temporary home');
	assert.equal(getGraphStorePath(), PATHS.lmdb);
	assert.equal(getLanceConnPath(), PATHS.lance);
});
after(async () => {
	for (const w of workers) await w.terminate();
	await closeLanceConn();
	await closeGraphStore();
	resetLiveStoreDeclarationsForTests();
	rmSync(HOME, { recursive: true, force: true });
});

test('a worker that has not declared the store owner is refused on the live LMDB and Lance paths, and startDaemonWorker refuses a main thread', async () => {
	// A thread of a process that never declared itself the owner: both live opens are refused before they touch the path.
	const stranger = await spawn(false);
	const refused = await stranger.run({ op: 'open-live' });
	assert.equal(refused.ok, true, JSON.stringify(refused));
	assert.deepEqual((refused['graph'] as { name: string }).name, 'LmdbStoreNotOwnerError', JSON.stringify(refused['graph']));
	assert.deepEqual((refused['lance'] as { name: string }).name, 'LanceStoreNotOwnerError', JSON.stringify(refused['lance']));
	assert.deepEqual(readdirSync(HOME), [], 'a refused open creates nothing in the home');

	// The worker entry declares the owner only inside a worker: a client process's main thread cannot use it.
	assert.equal(isLiveStoreOwnerDeclared(), false);
	const { port2 } = new MessageChannel();
	assert.throws(() => startDaemonWorker({ guardBlock, hubPort: port2 }), NotADaemonWorkerError);
	port2.close();
	assert.equal(isLiveStoreOwnerDeclared(), false, 'the refused call declared nothing');

	// A daemon worker opens both live stores.
	const daemonWorker = await spawn(true);
	const opened = await daemonWorker.run({ op: 'open-live' });
	assert.deepEqual([opened['graph'], opened['lance']], [null, null], JSON.stringify(opened));
});

test('no module outside src/daemon and src/db calls declareLiveStoreOwner', () => {
	const SRC = fileURLToPath(new URL('../../../', import.meta.url));
	const hits: string[] = [];
	const walk = (dir: string): void => {
		for (const entry of readdirSync(dir)) {
			const p = join(dir, entry);
			if (statSync(p).isDirectory()) { if (entry !== 'node_modules') walk(p); continue; }
			if (!/\.(ts|tsx|mts|js|mjs)$/.test(entry)) continue;
			const rel = relative(SRC, p);
			if (rel.startsWith(join('daemon', '')) || rel.startsWith(join('db', ''))) continue;
			if (readFileSync(p, 'utf8').includes('declareLiveStoreOwner')) hits.push(rel);
		}
	};
	walk(SRC);
	assert.ok(readFileSync(join(SRC, 'daemon', 'index.ts'), 'utf8').includes('declareLiveStoreOwner()'), 'the scan reads the files that do call it');
	assert.deepEqual(hits, []);
});

test('a reader on one thread sees only whole LMDB transactions while a worker writes, and vectors never precede their graph row', async () => {
	// The main thread is the daemon's: it declares the owner and joins the same guard block.
	declareLiveStoreOwner();
	installStoreGuard(guardBlock);
	await addRepo(null, { path: REPO, name: '', addedAt: new Date().toISOString(), status: 'pending' });
	const store = await getGraphStore();
	const conn = await getLanceConn();

	const BATCH = 7;
	const BATCHES = 25;
	const writer = await spawn(true);
	let done = false;
	const writing = writer.run({ op: 'upsert', repo: REPO, batches: BATCHES, batchSize: BATCH }).finally(() => { done = true; });

	const seen = new Set<number>();
	let reads = 0;
	let vectorsSeen = 0;
	while (!done) {
		// Vectors first, then the graph: a vector whose row is missing would show here.
		// This repo's vectors (the table also holds a seed row). The table appears on the
		// writer's first vector write; while it is being created it reads as absent.
		const ids = await conn.openTable('entity_vec')
			.then(async t => (await t.query().where(`repo = '${REPO}'`).select(['id']).toArray()).map(r => r['id'] as string))
			.catch((e: unknown) => { if (/was not found/.test(String(e))) return [] as string[]; throw e; });
		const count = store.entityIdByString.getKeysCount();
		assert.equal(count % BATCH, 0, `read ${reads}: ${count} entities is not a whole number of ${BATCH}-entity transactions`);
		for (const id of ids) assert.notEqual(store.entityIdByString.get(id), undefined, `vector ${id} was visible before its graph row`);
		seen.add(count);
		vectorsSeen = Math.max(vectorsSeen, ids.length);
		reads++;
		await new Promise(res => setImmediate(res));
	}
	const result = await writing;
	assert.equal(result.ok, true, JSON.stringify(result));
	assert.equal(store.entityIdByString.getKeysCount(), BATCH * BATCHES, 'every transaction is visible once the writer is done');
	assert.ok(seen.size > 2, `the reader saw the graph grow while the worker wrote (counts seen: ${[...seen].sort((a, b) => a - b).join(', ')})`);
	assert.ok(vectorsSeen > 0, 'the reader saw vectors during the writes');
});

test("two workers' artifact-vector and config writes are read back from a third thread", async () => {
	// The reader opens its stores first, so it reads through handles that were open before the writes.
	const reader = await spawn(true);
	const before = await reader.run({ op: 'read-config-and-artifact', tags: ['a', 'b'] });
	assert.deepEqual([before['configs'], before['artifacts']], [[], []], JSON.stringify(before));

	const [a, b] = [await spawn(true), await spawn(true)];
	const results = await Promise.all([a.run({ op: 'write-config-and-artifact', tag: 'a' }), b.run({ op: 'write-config-and-artifact', tag: 'b' })]);
	for (const r of results) assert.equal(r.ok, true, JSON.stringify(r));

	const after = await reader.run({ op: 'read-config-and-artifact', tags: ['a', 'b'] });
	assert.equal(after.ok, true, JSON.stringify(after));
	assert.deepEqual(after['configs'], ['body of cfg-a', 'body of cfg-b']);
	assert.deepEqual(after['artifacts'], ['a', 'b']);
});

test('a throwing withWriteTxn callback on a worker leaves none of its writes visible to the main thread', async () => {
	const store = await getGraphStore();
	const worker = await spawn(true);
	const result = await worker.run({ op: 'throwing-txn' });
	assert.equal(result.ok, true, JSON.stringify(result));
	assert.equal((result['thrown'] as { message: string }).message, 'the callback fails after writing');
	assert.equal(store.meta.get('ac4-meta'), undefined, 'the meta write is not visible');
	assert.equal(store.configEntry.get('ac4-config'), undefined, 'the config write is not visible');
	// The store still takes writes afterwards.
	await store.meta.put('ac4-after', 'ok');
	assert.equal(store.meta.get('ac4-after'), 'ok');
});

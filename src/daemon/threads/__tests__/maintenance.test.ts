/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Idle maintenance (Epic 86197ac6, Story s2, t16): idle detection, the
 * reclaimable estimate and its thresholds, the config keys, and a real
 * maintenance run on a daemon's threads -- requests refused during it, a
 * running request first, daemon.status reporting it, every row kept, the file
 * smaller; daemon.compact through it; the pause limit; the pre-rename check
 * when a worker does not close its handle; writes from every thread after it;
 * and the native environment really closed once every thread closed it.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/maintenance.test.ts
 */

import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-maintenance-'));
process.env['HOME'] = HOME;
process.env['INSRC_TEST_HOOKS'] = '1';
process.env['INSRC_TEST_STUB_SUMMARISER'] = '1';

const { open } = await import('lmdb');
const store = await import('../../../db/graph/store.js');
const { closeGraphStore, compactGraphStore, declareLiveStoreOwner, getGraphStore, getStoreHealth, graphStoreReclaimable, reclaimableFrom, worthCompacting, withWriteTxn } = store;
const { closeLanceConn } = await import('../../../db/lance/conn.js');
const { getDb, initDb } = await import('../../../db/client.js');
const { addRepo } = await import('../../../db/repos.js');
const { findEntitiesByFile } = await import('../../../db/entities.js');
const { ConfigStore } = await import('../../../config/store.js');
const { CONFIG_CATALOG } = await import('../../../config/config-catalog.js');
const { getLockManager } = await import('../../../shared/locks/lock-manager.js');
const { COMPACTION_ACTIVITY, MAINTENANCE_LOCK } = await import('../../../shared/locks/maintenance-lock.js');
const { PATHS } = await import('../../../shared/paths.js');
const { directDispatch } = await import('../../server.js');
const { ThreadServices, maintenanceConfig } = await import('../main-services.js');
const { methodClasses } = await import('../method-class.js');
const { Router } = await import('../router.js');
const { Supervisor } = await import('../supervisor.js');
const { startIndexingWorkers } = await import('../indexing-workers.js');
const { INDEXING_PORT } = await import('../indexing-port.js');
const { pushToWorker } = await import('../channel.js');
const { GRAPH_CLOSE_OP } = await import('../worker-entry.js');
const { DEFAULT_MAINTENANCE_CONFIG, MaintenanceController } = await import('../maintenance.js');
const { killAllStoreChildren, spawnStoreChild } = await import('../../../db/graph/__tests__/helpers/store-child-driver.js');
import type { MaintenanceConfig, MaintenanceDeps } from '../maintenance.js';
import type { ReplyEnvelope, RequestEnvelope } from '../channel.js';
import type { RpcHandlers } from '../../server.js';
import type { DaemonStatus } from '../../../shared/types.js';
import type { StartedWorker } from '../workers.js';

// ---------------------------------------------------------------------------
// Unit
// ---------------------------------------------------------------------------

describe('unit', () => {
	test('maintenance idle detection with a fake clock: admin requests do not reset idle; a non-admin request or a busy lane does', async () => {
		let clock = 1_000;
		let lanesIdle = true;
		const reclaimableAsked: number[] = [];
		const c = new MaintenanceController({
			config: { ...DEFAULT_MAINTENANCE_CONFIG, idleMs: 60_000 },
			now: () => clock, lanesIdle: () => lanesIdle, healthy: () => true,
			reclaimable: () => { reclaimableAsked.push(clock); return undefined; },
			workers: { live: () => [], created: () => 0 },
			compact: () => assert.fail('no compaction below the thresholds'),
		});
		clock += 30_000;
		c.requestArrived('daemon.status', 'admin')();
		c.requestArrived('repo.list', 'admin')();
		c.requestArrived('understanding.watch', 'session');
		assert.equal(c.idleForMs(), 30_000, 'admin polls and an open subscription are not activity');
		clock += 30_000;
		assert.equal(await c.tick(), 'below-threshold', 'idle for idleMs: the estimate is asked');
		assert.deepEqual(reclaimableAsked, [61_000]);

		clock += 10_000;
		const end = c.requestArrived('session.list', 'session');
		clock += 120_000;
		assert.equal(c.idleForMs(), 0, 'a non-admin request in flight');
		assert.equal(await c.tick(), 'not-idle');
		end();
		assert.equal(c.idleForMs(), 0, 'it reset idle when it ended');
		clock += 59_999;
		assert.equal(await c.tick(), 'not-idle');
		clock += 1;
		lanesIdle = false;
		assert.equal(c.idleForMs(), 0, 'a busy lane');
		assert.equal(await c.tick(), 'not-idle');
		lanesIdle = true;
		assert.equal(await c.tick(), 'below-threshold');
		assert.equal(reclaimableAsked.length, 2);
	});

	test('reclaimable estimate: pages in use summed over every named database against the file size; the 25% and 256 MB thresholds both required', async () => {
		const MiB = 1024 * 1024;
		const tree = (branch: number, leaf: number, overflow: number) => ({ treeBranchPageCount: branch, treeLeafPageCount: leaf, overflowPages: overflow });
		const r = reclaimableFrom([tree(1, 10, 5), tree(0, 4, 0), tree(2, 30, 100)], 4096, 1024 * MiB);
		assert.equal(r.usedBytes, (16 + 4 + 132) * 4096);
		assert.equal(r.reclaimableBytes, 1024 * MiB - 152 * 4096);
		assert.ok(Math.abs(r.reclaimablePct - (r.reclaimableBytes / (1024 * MiB)) * 100) < 1e-9);
		const at = (fileMb: number, usedMb: number) => reclaimableFrom([tree(0, (usedMb * MiB) / 4096, 0)], 4096, fileMb * MiB);
		assert.equal(worthCompacting(at(1024, 768), 25, 256), true, '25% and 256 MB');
		assert.equal(worthCompacting(at(1024, 769), 25, 256), false, 'under 256 MB');
		assert.equal(worthCompacting(at(800, 600), 25, 256), false, '25% but 200 MB');
		assert.equal(worthCompacting(at(4096, 3200), 25, 256), false, '896 MB but under 25%');

		// The live estimate takes every named database: pages written to one show as used.
		await closeGraphStore();
		const dir = mkdtempSync(join(tmpdir(), 'insrc-reclaim-'));
		store.setGraphStorePath(join(dir, 'graph.lmdb'));
		try {
			const before = graphStoreReclaimable() ?? (await getGraphStore(), graphStoreReclaimable())!;
			await withWriteTxn(s => { for (let i = 0; i < 2000; i++) s.docSummary.put(Buffer.from(`k${i}`), Buffer.alloc(2048)); });
			const after = graphStoreReclaimable()!;
			assert.ok(after.usedBytes - before.usedBytes >= 2000 * 2048, 'the docSummary pages are counted');
			assert.equal(after.fileBytes, statSync(join(dir, 'graph.lmdb')).size);
		} finally {
			await closeGraphStore();
			store.setGraphStorePath(PATHS.lmdb);
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test('the idle time, both thresholds and the pause limit are config schema keys with the design\'s defaults', () => {
		const row = (path: string) => CONFIG_CATALOG.find(r => r.path === path);
		assert.deepEqual(
			['idleMs', 'minReclaimablePct', 'minReclaimableMb', 'pauseLimitMs'].map(k => [row(`daemon.maintenance.${k}`)?.type, row(`daemon.maintenance.${k}`)?.default]),
			[['number', 30 * 60_000], ['number', 25], ['number', 256], ['number', 10 * 60_000]],
		);
		assert.deepEqual(DEFAULT_MAINTENANCE_CONFIG, { idleMs: 1_800_000, minReclaimablePct: 25, minReclaimableMb: 256, pauseLimitMs: 600_000 });
		mkdirSync(join(HOME, '.insrc'), { recursive: true });
		writeFileSync(PATHS.config, JSON.stringify({ daemon: { maintenance: { idleMs: 5, minReclaimableMb: -1, pauseLimitMs: 'x' } } }));
		try {
			assert.deepEqual(maintenanceConfig(), { idleMs: 5, minReclaimablePct: 25, minReclaimableMb: 256, pauseLimitMs: 600_000 }, 'read from config; a bad value falls back to its default');
		} finally {
			rmSync(PATHS.config, { force: true });
		}
	});
});

// ---------------------------------------------------------------------------
// Integration: a daemon's threads
// ---------------------------------------------------------------------------

const REPO = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-maintenance-repo-')));
let controller: InstanceType<typeof MaintenanceController> | undefined;
const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '', maintenance: controller?.status() }));
let slowGate: Promise<void> = Promise.resolve();
let slowEntered = false;
const rpc: RpcHandlers = {
	'x.slow': async () => { slowEntered = true; await slowGate; return 'slow done'; },
	'x.write': async (p) => {
		const key = (p as { key?: string } | undefined)?.key ?? 'x';
		await withWriteTxn(s => { s.meta.put(key, Buffer.from([1])); });
		return 'written';
	},
};
const router = new Router({ classOf: methodClasses.classOf, registry: services.registry, routed: new Set(['admin', 'indexing']), local: directDispatch(rpc) });
const supervisors: InstanceType<typeof Supervisor>[] = [];
const main = new Supervisor({ services, router, shutdown: () => assert.fail('no restart limit in this test') });
supervisors.push(main);
let indexing: ReturnType<typeof startIndexingWorkers>;
let writer: StartedWorker;

let seq = 0;
function ask(method: string, params: unknown = {}): Promise<ReplyEnvelope> {
	const requestId = `t${++seq}`;
	return new Promise(resolve => {
		router.forward({ kind: 'request', requestId, method, params, stream: false } satisfies RequestEnvelope, e => resolve(e as ReplyEnvelope));
	});
}
async function until(cond: () => boolean | Promise<boolean>, what: string, ms = 30_000): Promise<void> {
	const deadline = Date.now() + ms;
	while (!(await cond())) {
		if (Date.now() > deadline) assert.fail(`timed out waiting for: ${what}`);
		await new Promise(r => setTimeout(r, 25));
	}
}
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
/** A request held running until the returned release() is called. */
function slowRequest(): { reply: Promise<ReplyEnvelope>; release(): void } {
	let release!: () => void;
	slowGate = new Promise(r => { release = r; });
	slowEntered = false;
	return { reply: ask('x.slow'), release: () => release() };
}
/** A controller over this daemon's workers (every supervisor's). */
function makeController(config: Partial<MaintenanceConfig>, extra: Partial<MaintenanceDeps> = {}): InstanceType<typeof MaintenanceController> {
	const c = new MaintenanceController({
		config: { ...DEFAULT_MAINTENANCE_CONFIG, idleMs: 0, minReclaimablePct: 0, minReclaimableMb: 0, ...config },
		lanesIdle: () => services.board.snapshot().indexing.idle,
		healthy: () => getStoreHealth().state === 'ok',
		reclaimable: graphStoreReclaimable,
		workers: {
			live: () => supervisors.flatMap(s => s.liveWorkers()),
			created: () => supervisors.reduce((n, s) => n + s.createdCount(), 0),
		},
		compact: opts => compactGraphStore(opts),
		...extra,
	});
	controller = c;
	return c;
}
/** Entries per named database, as the test reads them. */
async function fingerprint(): Promise<Record<string, number>> {
	const s = await getGraphStore();
	const out: Record<string, number> = {};
	for (const [name, db] of Object.entries(s)) if (name !== 'root') out[name] = ((db as { getStats(): unknown }).getStats() as { entryCount: number }).entryCount;
	return out;
}
/** Rows written and deleted, so the file has space to give back. */
async function bloat(): Promise<void> {
	await withWriteTxn(s => { for (let i = 0; i < 4000; i++) s.meta.put(`bloat${i}`, Buffer.alloc(4096, 3)); });
	await withWriteTxn(s => { for (let i = 0; i < 4000; i++) s.meta.remove(`bloat${i}`); });
}
function writerOp(message: Record<string, unknown>): Promise<Record<string, unknown>> {
	return new Promise(resolve => {
		const on = (m: unknown): void => {
			if (typeof m === 'object' && m !== null && (m as { op?: string }).op === message['op']) { writer.worker.off('message', on); resolve(m as Record<string, unknown>); }
		};
		writer.worker.on('message', on);
		writer.worker.postMessage(message);
	});
}

before(async () => {
	declareLiveStoreOwner();
	const db = await getDb();
	await initDb(db);
	mkdirSync(join(REPO, 'src'), { recursive: true });
	writeFileSync(join(REPO, 'src', 'a.ts'), 'export function alpha(): number { return 1; }\n');
	await addRepo(db, { path: REPO, name: 'fixture', addedAt: new Date().toISOString(), status: 'pending' });
	indexing = startIndexingWorkers(main, services.indexingBlock);
	await indexing.ready;
	await main.start({ name: 'admin', cls: 'admin', script: 'admin-worker' });
	writer = await main.start({ name: 'store-writer', script: '__tests__/helpers/store-worker', extra: () => ({ workerData: { declare: true, supervised: true }, transferList: [] }) });
	services.onMaintenance(() => controller!.runNow());
	await until(async () => services.board.snapshot().indexing.idle && (await findEntitiesByFile(db, join(REPO, 'src', 'a.ts'))).length > 0, 'the fixture indexed', 60_000);
	// Every worker has the store open, as in a running daemon.
	assert.equal((await writerOp({ op: 'write-config-and-artifact', tag: 'before' }))['ok'], true);
});
after(async () => {
	killAllStoreChildren();
	await controller?.stop();
	await indexing.stop();
	for (const s of supervisors) await s.terminateAll();
	await closeLanceConn();
	await closeGraphStore();
	for (const d of [HOME, REPO]) rmSync(d, { recursive: true, force: true });
});

describe('integration', () => {
	test('maintenance: with idle forced and the threshold met, requests sent during compaction are refused with the maintenance activity and reason, a running request finishes first, daemon.status reports compacting, every row is kept and the file shrank', { timeout: 120_000 }, async () => {
		await bloat();
		const r = graphStoreReclaimable()!;
		assert.ok(r.reclaimablePct >= 10, `space to give back: ${r.reclaimablePct}%`);
		const rows = await fingerprint();
		const size = statSync(PATHS.lmdb).size;
		const order: string[] = [];
		// Maintenance waits on a gate once granted; the requests "during" it come from outside its
		// callback, as a socket's do (inside it, a request would be a nested call under its hold).
		let granted!: () => void;
		const isGranted = new Promise<void>(r => { granted = r; });
		let resume!: () => void;
		const resumed = new Promise<void>(r => { resume = r; });
		const c = makeController({ minReclaimablePct: 10 }, {
			onGranted: async () => { order.push('granted'); granted(); await resumed; },
		});
		const slow = slowRequest();
		await until(() => slowEntered, 'the running request');
		const ticked = c.tick();
		await sleep(150);
		const whilePausing = await ask('x.write', { key: 'pausing' });
		const busy = new RegExp(`^daemon busy: ${COMPACTION_ACTIVITY} since \\S+ \\(0 min idle, [0-9.]+% / [0-9]+ MB reclaimable\\); retry later$`);
		assert.match(whilePausing.error ?? '', busy, 'refused from the moment maintenance asked');
		void slow.reply.then(() => order.push('running request finished'));
		slow.release();
		assert.equal((await slow.reply).result, 'slow done');
		await isGranted;
		const during = { status: (await ask('daemon.status')).result as DaemonStatus, refused: await ask('x.write', { key: 'during' }) };
		resume();
		assert.equal(await ticked, 'compacted');
		assert.deepEqual(order, ['running request finished', 'granted']);
		assert.equal(during.status?.maintenance?.state, 'compacting');
		assert.equal(during.status?.maintenance?.activity, COMPACTION_ACTIVITY);
		assert.match(during.status?.maintenance?.reason ?? '', /min idle, .*reclaimable/);
		assert.match(during.refused?.error ?? '', busy, 'refused during the compaction');
		assert.deepEqual(await fingerprint(), rows, 'every row is kept');
		assert.ok(statSync(PATHS.lmdb).size < size, 'the file shrank');
		assert.equal(c.status(), undefined, 'not reported once done');
		assert.equal((await ask('x.write', { key: 'after' })).result, 'written', 'requests are accepted again');
	});

	test("manual daemon.compact returns today's CompactResult when idle and today's busy refusal while the queue has work, and does not wait on a hold of its own", { timeout: 120_000 }, async () => {
		makeController({ pauseLimitMs: 5_000 });
		const t0 = Date.now();
		const done = await ask('daemon.compact');
		assert.equal(done.error, undefined, done.error);
		assert.deepEqual(Object.keys(done.result as object).sort(), ['afterBytes', 'beforeBytes', 'elapsedMs', 'savedBytes']);
		assert.ok(Date.now() - t0 < 5_000, 'well inside the pause limit: it held nothing that maintenance waited for');
		await router.request('indexing', INDEXING_PORT.enqueue, { kind: 'full', repoPath: REPO });
		const busy = await ask('daemon.compact');
		assert.match(busy.error ?? '', /^daemon\.compact: indexer is busy \(queue=\d+, processing=(true|false)\)\. Wait for indexing to drain before compacting\.$/);
		await until(() => services.board.snapshot().indexing.idle, 'the reindex to finish', 60_000);
	});

	test('a request that keeps running past the pause limit makes maintenance abandon without closing anything, and requests are accepted again afterwards', { timeout: 60_000 }, async () => {
		let granted = false;
		const c = makeController({ pauseLimitMs: 300 }, { onGranted: async () => { granted = true; } });
		const slow = slowRequest();
		await until(() => slowEntered, 'the running request');
		const t0 = Date.now();
		assert.equal(await c.tick(), 'abandoned');
		assert.ok(Date.now() - t0 < 5_000);
		assert.equal(granted, false, 'never granted: no worker was asked to close and nothing was compacted');
		assert.ok(graphStoreReclaimable() !== undefined, 'the main thread\'s store is still open');
		await assert.rejects(c.runNow(), /the daemon was not idle in time/, 'daemon.compact gets the not-idle-in-time error');
		slow.release();
		await slow.reply;
		assert.equal((await ask('x.write', { key: 'after-abandon' })).result, 'written');
		assert.equal((await ask('repo.stats', {})).error, undefined, 'the workers serve as before');
		assert.equal((await writerOp({ op: 'read-config-and-artifact', tags: ['before'] }))['ok'], true);
	});

	test("the pre-rename check returns false when a worker has not acknowledged 'graph.close': no rename, no lock-file removal, the original store reopens and serves", { timeout: 60_000 }, async () => {
		const deaf = new Supervisor({ services, router, shutdown: () => {} });
		supervisors.push(deaf);
		try {
			await deaf.start({ name: 'deaf', script: '__tests__/helpers/deaf-worker' });
			await bloat();
			const c = makeController({}, { ackMs: 500 });
			const ino = statSync(PATHS.lmdb).ino;
			const lockIno = statSync(`${PATHS.lmdb}-lock`).ino;
			const rows = await fingerprint();
			await assert.rejects(c.runNow(), /the environment was still open; nothing renamed/);
			assert.equal(statSync(PATHS.lmdb).ino, ino, 'not renamed');
			assert.equal(statSync(`${PATHS.lmdb}-lock`).ino, lockIno, 'the lock file was not removed');
			assert.deepEqual(['.compact', '.bak', '.compact-manifest'].filter(x => existsSync(PATHS.lmdb + x)), []);
			assert.deepEqual(await fingerprint(), rows);
			assert.equal((await ask('x.write', { key: 'after-deaf' })).result, 'written', 'the original store serves');
		} finally {
			deaf.stop();
			await deaf.terminateAll();
			supervisors.splice(supervisors.indexOf(deaf), 1);
		}
	});

	test("after maintenance, writes from the main thread and from each worker land in the compacted file and the process's LMDB lock is still held", { timeout: 120_000 }, async () => {
		await bloat();
		const c = makeController({});
		await c.runNow();
		const compacted = statSync(PATHS.lmdb).ino;
		assert.equal((await ask('x.write', { key: 'main-after' })).result, 'written');
		writeFileSync(join(REPO, 'src', 'after.ts'), 'export function afterMaintenance(): number { return 2; }\n');
		assert.equal((await ask('index.file', { filePath: join(REPO, 'src', 'after.ts'), event: 'create' })).error, undefined);
		assert.equal((await writerOp({ op: 'write-config-and-artifact', tag: 'after' }))['ok'], true);
		await until(async () => (await findEntitiesByFile(await getDb(), join(REPO, 'src', 'after.ts'))).length > 0, 'the code-indexing worker\'s write');
		assert.deepEqual((await getGraphStore()).meta.get('main-after'), Buffer.from([1]));
		assert.equal((await new ConfigStore(null).getEntry('cfg-after'))?.body, 'body of cfg-after', 'the store worker\'s write');
		assert.equal(statSync(PATHS.lmdb).ino, compacted, 'every write went to the compacted file');

		// Another process opens, writes and closes the store: were this process's lock lost, its close would
		// remove the semaphores this process uses and the next write here would fail.
		const child = await spawnStoreChild(PATHS.lmdb, { raw: true });
		for (const cmd of [{ op: 'open' }, { op: 'put', key: 'child' }, { op: 'close' }] as const) assert.equal((await child.send(cmd)).ok, true);
		await child.kill();
		assert.equal((await ask('x.write', { key: 'after-child' })).result, 'written');
		assert.equal((await ask('index.file', { filePath: join(REPO, 'src', 'after.ts'), event: 'update' })).error, undefined);
		assert.equal(getStoreHealth().state, 'ok', 'the lock is still held');
	});

	test('after every worker\'s closeGraphStore and the main thread\'s close, the native environment is really gone: a fresh open in-process sees a new environment', { timeout: 60_000 }, async () => {
		// As maintenance does it: the lock exclusively, every worker closes, then this thread.
		let release!: () => void;
		const gate = new Promise<void>(r => { release = r; });
		let granted!: () => void;
		const isGranted = new Promise<void>(r => { granted = r; });
		const held = getLockManager().request(MAINTENANCE_LOCK, { mode: 'exclusive', timeoutMs: 30_000, metadata: { activity: COMPACTION_ACTIVITY, reason: 'test' } }, async () => { granted(); await gate; });
		await isGranted;
		const saved = `${PATHS.lmdb}.saved`;
		try {
			for (const w of supervisors.flatMap(s => s.liveWorkers())) {
				const { port1, port2 } = new MessageChannel();
				const ack = new Promise(r => port1.once('message', r));
				pushToWorker(w.port, GRAPH_CLOSE_OP, port2, [port2]);
				assert.equal(await ack, 'closed');
				port1.close();
			}
			await closeGraphStore();
			// A different environment under the same name.
			renameSync(PATHS.lmdb, saved);
			rmSync(`${PATHS.lmdb}-lock`, { force: true });
			const other = open({ path: PATHS.lmdb, maxDbs: 64 });
			await other.put('fresh-environment', 'yes');
			await other.close();
			const s = await getGraphStore();
			assert.equal(s.root.get('fresh-environment'), 'yes', 'the open found the new file: no environment was left open in the process');
			await closeGraphStore();
		} finally {
			if (existsSync(saved)) {
				renameSync(saved, PATHS.lmdb);
				rmSync(`${PATHS.lmdb}-lock`, { force: true });
			}
			release();
			await held;
		}
		assert.equal((await ask('x.write', { key: 'back' })).result, 'written');
		assert.equal((await ask('repo.stats', {})).error, undefined);
	});
});

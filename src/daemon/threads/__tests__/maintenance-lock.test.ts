/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon maintenance lock at every entry point (Epic 86197ac6, Story s2,
 * t15): while maintenance holds 'daemon.maintenance' exclusively a request is
 * refused with the holder's activity, reason and start time (daemon.status is
 * answered); a nested call under a request's hold does not ask again; a timer
 * write waits and lands after the compaction; getGraphStore on another thread
 * rejects during it; a subscription stream holds nothing and skips a refresh
 * during maintenance.
 *
 * Maintenance itself (t16) is played by the test: it takes the lock
 * exclusively with its metadata, as the controller will.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/maintenance-lock.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import type { Socket } from 'node:net';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-maintenance-lock-'));
process.env['HOME'] = HOME;

const { closeGraphStore, compactGraphStore, declareLiveStoreOwner } = await import('../../../db/graph/store.js');
const { closeLanceConn } = await import('../../../db/lance/conn.js');
const { getDb, initDb } = await import('../../../db/client.js');
const { addRepo } = await import('../../../db/repos.js');
const { getSessionById, saveSession } = await import('../../../db/conversations.js');
const { getLockManager } = await import('../../../shared/locks/lock-manager.js');
const { COMPACTION_ACTIVITY, MAINTENANCE_LOCK } = await import('../../../shared/locks/maintenance-lock.js');
const { IpcServer, directDispatch } = await import('../../server.js');
const { createInDaemonClient } = await import('../../steps/daemon-client.js');
const { runPruneSweep } = await import('../../prune-timer.js');
const { emitTodosEvent, scheduleTodosRetention, subscribe: subscribeTodos } = await import('../../todos-rpc.js');
const { IndexerService } = await import('../../../indexer/index.js');
const { IndexQueue } = await import('../../queue.js');
const { DEFAULT_MAINTENANCE_CONFIG, MaintenanceController } = await import('../maintenance.js');
const { createUnderstandingRoutes } = await import('../../understanding-rpc.js');
const { UnderstandingService } = await import('../../../understanding/service.js');
const { ThreadServices } = await import('../main-services.js');
const { methodClasses } = await import('../method-class.js');
const { Router } = await import('../router.js');
const { startClassWorker } = await import('../workers.js');
const { INDEXING_DRAINED, INDEXING_STOP_OP } = await import('../indexing-port.js');
const { pushToWorker } = await import('../channel.js');
import type { MessagePort } from 'node:worker_threads';
import type { ReplyEnvelope, RequestEnvelope, FrameEnvelope, MethodClass } from '../channel.js';
import type { RpcHandlers, StreamHandlers } from '../../server.js';
import type { Owner } from '../../../understanding/service.js';
import type { AssessmentScope } from '../../../shared/understanding.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-maintenance-lock-repo-')));
const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }));
const REASON = '31 min idle, 40% / 300 MB reclaimable';
let codeWorker: { worker: Worker; port: MessagePort } | undefined;

/** Maintenance, played by the test: the lock exclusively, until release(). */
function holdMaintenance(activity = COMPACTION_ACTIVITY): { granted: Promise<void>; isGranted(): boolean; release(): void; done: Promise<void>; run(fn: () => Promise<void>): Promise<void> } {
	let release!: () => void;
	const gate = new Promise<void>(r => { release = r; });
	let grant!: () => void;
	const granted = new Promise<void>(r => { grant = r; });
	let isGranted = false;
	let work: (() => Promise<void>) | undefined;
	let workDone!: () => void;
	const ran = new Promise<void>(r => { workDone = r; });
	const done = getLockManager().request(MAINTENANCE_LOCK, { mode: 'exclusive', metadata: { activity, reason: REASON }, timeoutMs: 120_000 }, async () => {
		isGranted = true;
		grant();
		await gate;
		if (work !== undefined) { await work(); workDone(); }
	});
	return {
		granted, isGranted: () => isGranted, done,
		release: () => release(),
		/** Run `fn` as maintenance, still holding the lock, then release. */
		run: fn => { work = fn; release(); return ran; },
	};
}
const sinceOfHolder = (): number => getLockManager().query().held.find(l => l.name === MAINTENANCE_LOCK)!.since;

let seq = 0;
function ask(router: InstanceType<typeof Router>, method: string, params: unknown = {}): Promise<ReplyEnvelope> {
	const requestId = `m${++seq}`;
	return new Promise(resolve => {
		router.forward({ kind: 'request', requestId, method, params, stream: false } satisfies RequestEnvelope, e => resolve(e as ReplyEnvelope));
	});
}
async function until(cond: () => boolean | Promise<boolean>, what: string, ms = 30_000): Promise<void> {
	const deadline = Date.now() + ms;
	while (!(await cond())) {
		if (Date.now() > deadline) assert.fail(`timed out waiting for: ${what}`);
		await new Promise(r => setTimeout(r, 20));
	}
}
const tick = (ms = 150): Promise<void> => new Promise(r => setTimeout(r, ms));
/** Count the shared requests for the maintenance lock made on this thread. */
function countSharedRequests(): { count(): number; restore(): void } {
	const manager = getLockManager();
	const original = manager.request.bind(manager);
	let n = 0;
	manager.request = ((name, options, callback) => {
		if (name === MAINTENANCE_LOCK && options.mode === 'shared') n++;
		return original(name, options, callback);
	}) as typeof manager.request;
	return { count: () => n, restore: () => { manager.request = original; } };
}

before(async () => {
	declareLiveStoreOwner();
	const db = await getDb();
	await initDb(db);
	mkdirSync(join(REPO, 'src'), { recursive: true });
	writeFileSync(join(REPO, 'src', 'a.ts'), 'export function alpha(): number { return 1; }\n');
	await addRepo(db, { path: REPO, name: 'fixture', addedAt: new Date().toISOString(), status: 'pending' });
});
after(async () => {
	if (codeWorker !== undefined) {
		const { worker, port } = codeWorker;
		const drained = new Promise<void>(resolve => worker.on('message', m => { if (m === INDEXING_DRAINED) resolve(); }));
		pushToWorker(port, INDEXING_STOP_OP, null);
		await drained;
		await worker.terminate();
	}
	await closeLanceConn();
	await closeGraphStore();
	for (const d of [HOME, REPO]) rmSync(d, { recursive: true, force: true });
});

test('maintenance lock at the router: with the lock held exclusively by maintenance, a request other than daemon.status is refused with the activity, reason and start time and does not run; daemon.status is answered', async () => {
	const ran: string[] = [];
	const router = new Router({
		classOf: methodClasses.classOf, registry: services.registry, routed: new Set(),
		local: directDispatch({
			'x.write': async () => { ran.push('x.write'); return 'written'; },
			'daemon.status': async () => { ran.push('daemon.status'); return { ok: true }; },
			'daemon.compact': async () => { ran.push('daemon.compact'); return 'compact asked'; },
		}, {
			's.watch': async (_p, send) => { ran.push('s.watch'); send({ id: 0, stream: 'done', data: {} }); },
		}),
	});
	const maintenance = holdMaintenance();
	await maintenance.granted;
	const expected = `daemon busy: ${COMPACTION_ACTIVITY} since ${new Date(sinceOfHolder()).toISOString()} (${REASON}); retry later`;

	assert.deepEqual(await ask(router, 'x.write'), { kind: 'reply', requestId: `m${seq}`, error: expected });
	const frame = await new Promise<FrameEnvelope>(resolve => {
		router.forward({ kind: 'request', requestId: 'stream-1', method: 's.watch', params: {}, stream: true }, e => resolve(e as FrameEnvelope));
	});
	assert.deepEqual(frame.frame, { id: 0, stream: 'error', data: { error: expected, recoverable: true } }, 'a stream request is refused with an error frame');
	assert.deepEqual(ran, [], 'nothing ran');
	assert.deepEqual((await ask(router, 'daemon.status')).result, { ok: true }, 'daemon.status is answered');
	assert.equal((await ask(router, 'daemon.compact')).result, 'compact asked', 'daemon.compact is not held either');

	maintenance.release();
	await maintenance.done;
	assert.equal((await ask(router, 'x.write')).result, 'written', 'after maintenance the request runs');
	assert.deepEqual(ran, ['daemon.status', 'daemon.compact', 'x.write']);
});

test("a step handler's nested in-daemon call under a request's shared hold runs without re-requesting the maintenance lock", async () => {
	const order: string[] = [];
	let open!: () => void;
	const gate = new Promise<void>(r => { open = r; });
	let entered = false;
	const rpc: RpcHandlers = {
		'x.inner': async () => { order.push('inner'); return 'inner done'; },
		'step.outer': async () => {
			entered = true;
			await gate;
			const inner = await createInDaemonClient(rpc, streams).request('x.inner', {});
			return { inner };
		},
	};
	const streams: StreamHandlers = {};
	const router = new Router({ classOf: methodClasses.classOf, registry: services.registry, routed: new Set(), local: directDispatch(rpc, streams) });
	const spy = countSharedRequests();
	try {
		const outer = ask(router, 'step.outer').then(r => { order.push('outer'); return r; });
		await until(() => entered, 'the outer request running');
		// Maintenance asks now: by writer preference no new shared hold is granted from here on.
		const maintenance = holdMaintenance();
		void maintenance.granted.then(() => order.push('maintenance'));
		await tick();
		assert.equal(maintenance.isGranted(), false, 'maintenance waits for the running request');
		open();
		assert.deepEqual((await outer).result, { inner: 'inner done' }, 'the nested call ran');
		await maintenance.granted;
		assert.deepEqual(order, ['inner', 'outer', 'maintenance']);
		assert.equal(spy.count(), 1, 'one shared request: the outer request\'s; the nested call asked for none');
		maintenance.release();
		await maintenance.done;
	} finally {
		spy.restore();
	}
});

test("an exclusive maintenance request that becomes pending while a session request's nested call to repo.reindex is running on the code-indexing worker: the nested call completes, the outer request finishes, then maintenance proceeds", { timeout: 120_000 }, async () => {
	const routed = new Set<MethodClass>(['indexing']);
	const order: string[] = [];
	let entered = false;
	let open!: () => void;
	const gate = new Promise<void>(r => { open = r; });
	let router!: InstanceType<typeof Router>;
	let maintenance: ReturnType<typeof holdMaintenance> | undefined;
	let pendingWhileNestedRan = false;
	let nestedSent!: () => void;
	const sent = new Promise<void>(r => { nestedSent = r; });
	let maintenanceAsked!: () => void;
	const asked = new Promise<void>(r => { maintenanceAsked = r; });
	const rpc: RpcHandlers = {
		'step.reindex': async () => {
			entered = true;
			await gate;
			// The nested call reaches the code-indexing worker only once maintenance (asked from outside this
			// request) is pending, so the worker serves it while an exclusive request waits for the lock.
			const route = async (cls: MethodClass, method: string, params: unknown): Promise<unknown> => {
				nestedSent();
				await asked;
				return router.request(cls, method, params);
			};
			const client = createInDaemonClient(rpc, {}, { route: { classOf: methodClasses.classOf, routed, request: route } });
			const result = await client.request('repo.reindex', { path: REPO });
			pendingWhileNestedRan = maintenance !== undefined && !maintenance.isGranted();
			order.push('nested');
			return result;
		},
	};
	router = new Router({ classOf: methodClasses.classOf, registry: services.registry, routed, local: directDispatch(rpc, {}) });
	const started = await startClassWorker(services, router, 'indexing', 'indexing-worker');
	codeWorker = { worker: started.worker, port: started.port };
	await until(() => services.board.snapshot().indexing.idle && (services.board.snapshot().store.repos?.length ?? 0) > 0, 'the code-indexing worker idle', 60_000);

	const outer = ask(router, 'step.reindex').then(r => { order.push('outer'); return r; });
	await until(() => entered, 'the session request running');
	open();
	await sent;
	maintenance = holdMaintenance();
	void maintenance.granted.then(() => order.push('maintenance'));
	await until(() => getLockManager().query().pending.some(l => l.name === MAINTENANCE_LOCK && l.mode === 'exclusive'), 'maintenance pending');
	maintenanceAsked();
	const reply = await outer;
	assert.ok(maintenance !== undefined);
	assert.equal(pendingWhileNestedRan, true, 'maintenance became pending while the nested call ran on the worker, and stayed pending until it completed');
	assert.equal(reply.error, undefined, `the nested repo.reindex ran on the worker under the outer hold: ${reply.error}`);
	assert.deepEqual(reply.result, { ok: true });
	await maintenance.granted;
	assert.deepEqual(order, ['nested', 'outer', 'maintenance']);
	// The reindex job it queued waits for maintenance (a bounded wait), then runs.
	await tick(300);
	assert.equal(services.board.snapshot().indexing.idle, false, 'the queued reindex waits while maintenance holds the lock');
	maintenance.release();
	await maintenance.done;
	await until(() => services.board.snapshot().indexing.idle, 'the reindex to run after maintenance', 60_000);
});

test('a prune-timer write scheduled to fire during compaction waits for the maintenance lock and lands in the compacted store; getGraphStore called on a worker during compaction rejects with MaintenanceInProgress', { timeout: 60_000 }, async () => {
	const db = await getDb();
	// A worker of this daemon (its store not yet opened).
	const conn = services.connectWorker();
	const worker = new Worker(join(HERE, 'helpers', 'store-worker.ts'), { workerData: { declare: true, ...conn.workerData }, transferList: conn.transferList });
	const replies: Record<string, unknown>[] = [];
	worker.on('message', (m: Record<string, unknown>) => replies.push(m));
	await until(() => replies.some(r => r['op'] === 'ready'), 'the store worker');
	const openLive = async (): Promise<Record<string, unknown>> => {
		const n = replies.length;
		worker.postMessage({ op: 'open-live' });
		await until(() => replies.length > n, 'the worker\'s answer');
		return replies[n]!;
	};
	try {
		const maintenance = holdMaintenance();
		await maintenance.granted;
		const rejected = await openLive();
		assert.equal((rejected['graph'] as { name?: string } | null)?.name, 'MaintenanceInProgressError', JSON.stringify(rejected));

		// The timer fires during maintenance: its write waits.
		const id = `prune-${randomUUID()}`;
		let wrote = false;
		const sweep = runPruneSweep(db, {
			prune: async d => { await saveSession(d, { id, repo: REPO, summary: 'written by the prune timer' }); wrote = true; return { expired: 0, capped: 0 }; },
			compact: async () => ({ warmCompressed: 0, coldMerged: 0, archived: 0, directives: 0 }) as never,
		});
		await tick();
		assert.equal(wrote, false, 'the timer write waits for maintenance');
		let compacted: unknown;
		await maintenance.run(async () => { compacted = await compactGraphStore(); });
		await maintenance.done;
		assert.ok(compacted !== undefined, 'the store was compacted under the lock');
		await sweep;
		assert.equal(wrote, true);
		assert.equal((await getSessionById(db, id))?.summary, 'written by the prune timer', 'the write landed in the compacted store');
		assert.equal((await openLive())['graph'], null, 'after maintenance the worker opens the store');
	} finally {
		await worker.terminate();
		conn.disconnect();
	}
});

test('an open understanding.watch stream does not prevent idle detection or maintenance; its refresh during maintenance is skipped and the next one after maintenance is delivered', { timeout: 60_000 }, async () => {
	const owner: Owner = { ownerPrincipal: 'owner', learner: { key: 'learner', source: 'git', authority: 'git-email', subject: 'private', assurance: 'local-config', aliases: [] } };
	const scope: AssessmentScope = { repoId: 'repo', worktreeId: 'worktree', baseOid: null, stagedTreeOid: 'a'.repeat(40), commitMode: 'normal', parentOids: [], learnerKey: 'learner', policyRevision: 'p', evidenceRevision: 'e' };
	let service: InstanceType<typeof UnderstandingService> | undefined;
	const routes = createUnderstandingRoutes({ service: () => service!, owner: async () => owner });
	// Idle detection as the daemon wires it: the router reports every request to the controller.
	const idle = new MaintenanceController({
		config: { ...DEFAULT_MAINTENANCE_CONFIG, idleMs: 60_000 },
		lanesIdle: () => true, healthy: () => true, reclaimable: () => undefined,
		workers: { live: () => [], created: () => 0 },
		compact: async () => assert.fail('no compaction in this test'),
	});
	const router = new Router({ classOf: methodClasses.classOf, registry: services.registry, routed: new Set(), local: directDispatch(routes.rpc, routes.streams), onRequest: (method, cls) => idle.requestArrived(method, cls) });
	const sock = join(HOME, 'watch.sock');
	const server = new IpcServer(router.forward, Date.now, sock);
	await server.listen();
	service = await UnderstandingService.open(sock);
	let socket: Socket | undefined;
	try {
		const id = (await service.prepare(owner, scope, randomUUID())).view.id;
		socket = connect(sock);
		const frames: { stream: string; data: { type?: string; revision?: number } }[] = [];
		let pending = '';
		socket.on('data', d => {
			pending += d.toString();
			let end: number;
			while ((end = pending.indexOf('\n')) >= 0) { frames.push(JSON.parse(pending.slice(0, end))); pending = pending.slice(end + 1); }
		});
		await once(socket, 'connect');
		socket.write(JSON.stringify({ id: 9, method: 'understanding.watch', params: { assessmentId: id }, stream: true }) + '\n');
		await until(() => frames.length > 0, 'the first snapshot');
		assert.equal(frames[0]!.data.revision, 1);

		// The open stream is not activity: the daemon's idle time keeps growing while it is open.
		const idleBefore = idle.idleForMs();
		await tick(250);
		assert.ok(idle.idleForMs() >= idleBefore + 200, `idle keeps growing with the stream open (${idleBefore} -> ${idle.idleForMs()} ms)`);
		// (An ordinary request would reset it: shown for contrast.)
		const end = idle.requestArrived('x.write', 'session');
		assert.equal(idle.idleForMs(), 0, 'a running ordinary request is activity');
		end();
		// The open stream holds no lock: maintenance is granted at once.
		assert.deepEqual(getLockManager().query().held.filter(l => l.name === MAINTENANCE_LOCK), [], 'the stream holds nothing');
		const maintenance = holdMaintenance();
		await maintenance.granted;
		// A change during maintenance: its refresh is skipped.
		await service.cancel(owner, { assessmentId: id, expectedRevision: 1, requestId: randomUUID(), scope });
		await tick(300);
		assert.equal(frames.length, 1, 'no refresh was delivered during maintenance');
		maintenance.release();
		await maintenance.done;
		// The next refresh (the stream's timer, nudged here) is delivered with the revision it missed.
		(service as unknown as { publish(id: string): void }).publish(id);
		await until(() => frames.length > 1, 'the refresh after maintenance');
		assert.equal(frames[1]!.stream, 'progress');
		assert.equal(frames[1]!.data.type, 'snapshot');
		assert.equal(frames[1]!.data.revision, 2);
	} finally {
		socket?.destroy();
		routes.stop();
		service?.stop();
		await server.close();
	}
});

test('the todo-retention sweep that fires during maintenance waits for the maintenance lock and runs after it', { timeout: 60_000 }, async () => {
	const db = await getDb();
	const shared = countSharedRequests();
	const maintenance = holdMaintenance();
	await maintenance.granted;
	let stop: (() => void) | undefined;
	try {
		// Fires once at once (as at boot): its sweep asks for the lock shared and waits.
		stop = scheduleTodosRetention(db);
		await until(() => shared.count() > 0, 'the retention sweep to ask for the maintenance lock');
		const waiting = (): number => getLockManager().query().pending.filter(l => l.name === MAINTENANCE_LOCK && l.mode === 'shared').length;
		await tick(300);
		assert.equal(waiting(), 1, 'the sweep waits for maintenance');
		maintenance.release();
		await maintenance.done;
		await until(() => waiting() === 0 && !getLockManager().query().held.some(l => l.name === MAINTENANCE_LOCK), 'the sweep to run and release after maintenance');
	} finally {
		stop?.();
		shared.restore();
	}
});

test('a todos.subscribe stream holds no lock; a push during maintenance is skipped and the next one after maintenance is delivered', { timeout: 60_000 }, async () => {
	const sent: { stream: string; data: unknown }[] = [];
	const aborter = new AbortController();
	const stream = subscribeTodos({}, m => { sent.push({ stream: m.stream, data: m.data }); }, aborter.signal);
	const list = { id: `list-${randomUUID()}` } as unknown as Parameters<typeof emitTodosEvent>[1];
	try {
		assert.deepEqual(getLockManager().query().held.filter(l => l.name === MAINTENANCE_LOCK), [], 'the open stream holds nothing');
		const maintenance = holdMaintenance();
		await maintenance.granted;
		emitTodosEvent('listUpdated', list);
		await tick(300);
		assert.equal(sent.filter(m => m.stream === 'todos').length, 0, 'no push during maintenance');
		maintenance.release();
		await maintenance.done;
		emitTodosEvent('listUpdated', list);
		await until(() => sent.some(m => m.stream === 'todos'), 'the push after maintenance');
		assert.equal(sent.filter(m => m.stream === 'todos').length, 1, 'only the push after maintenance was delivered');
	} finally {
		aborter.abort();
		await stream;
	}
});

test("an edit's settle pass that comes due during maintenance waits for the maintenance lock instead of failing, and runs after it", { timeout: 60_000 }, async () => {
	const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as never;
	class Settling extends IndexerService {
		constructor() { super(null as never, new IndexQueue(), watcher, undefined, 300); }
	}
	const svc = new Settling();
	await svc.start([{ path: REPO, name: 'fixture', addedAt: new Date().toISOString(), status: 'ready' }]);
	const waiting = (): number => getLockManager().query().pending.filter(l => l.name === MAINTENANCE_LOCK && l.mode === 'shared').length;
	// The edit is indexed; its settle is due 300 ms later, while maintenance holds the lock.
	await svc.processJob({ kind: 'file', filePath: join(REPO, 'src', 'a.ts'), event: 'update' });
	const maintenance = holdMaintenance();
	await maintenance.granted;
	await until(() => svc._armedSettleTimersForTest() === 0, 'the settle timer to fire');
	await until(() => waiting() === 1, 'the settle pass to wait for maintenance');
	let settled = false;
	void svc._settlePassesDoneForTest().then(() => { settled = true; });
	await tick(300);
	assert.equal(settled, false, 'the settle pass has not run during maintenance');
	maintenance.release();
	await maintenance.done;
	await until(() => settled, 'the settle pass to run after maintenance');
	assert.equal(waiting(), 0);
});

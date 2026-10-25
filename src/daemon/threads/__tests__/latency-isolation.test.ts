/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The Story's cross-cutting proof (Epic 86197ac6, Story s2, t17), with the
 * real router and workers on a temporary HOME: while an indexing pass runs
 * and another worker keeps an LMDB write transaction open, the admin methods
 * answer within 100 ms (p99 over 50 calls each) and a session request on the
 * main thread is answered.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/latency-isolation.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-latency-'));
process.env['HOME'] = HOME;
process.env['INSRC_TEST_STUB_SUMMARISER'] = '1';

const { closeGraphStore, declareLiveStoreOwner } = await import('../../../db/graph/store.js');
const { closeLanceConn } = await import('../../../db/lance/conn.js');
const { getDb, initDb } = await import('../../../db/client.js');
const { addRepo } = await import('../../../db/repos.js');
const { directDispatch } = await import('../../server.js');
const { buildHandlerRuntime } = await import('../../handler-runtime.js');
const { ThreadServices } = await import('../main-services.js');
const { methodClasses } = await import('../method-class.js');
const { Router } = await import('../router.js');
const { Supervisor } = await import('../supervisor.js');
const { startIndexingWorkers } = await import('../indexing-workers.js');
const { IndexingPortClient } = await import('../indexing-port.js');
import type { ReplyEnvelope, RequestEnvelope } from '../channel.js';
import type { StartedWorker } from '../workers.js';

const FILES = 1500;
const CALLS = 50;
const ADMIN_METHODS: readonly [string, unknown][] = [
	['daemon.status', {}], ['repo.list', {}], ['daemon.debug-status', {}], ['config.show', {}], ['config.catalog', {}], ['guide.list', {}],
];
const REPO = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-latency-repo-')));
const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }));
let local: ReturnType<typeof directDispatch> | undefined;
const router = new Router({ classOf: methodClasses.classOf, registry: services.registry, routed: new Set(['admin', 'indexing']), local: (r, d) => local!(r, d) });
const supervisor = new Supervisor({ services, router, shutdown: () => assert.fail('no restart limit in this test') });
let indexing: ReturnType<typeof startIndexingWorkers>;
let writer: StartedWorker;

let seq = 0;
function ask(method: string, params: unknown): Promise<ReplyEnvelope> {
	const requestId = `l${++seq}`;
	return new Promise(resolve => {
		router.forward({ kind: 'request', requestId, method, params, stream: false } satisfies RequestEnvelope, e => resolve(e as ReplyEnvelope));
	});
}
async function until(cond: () => boolean, what: string, ms = 60_000): Promise<void> {
	const deadline = Date.now() + ms;
	while (!cond()) {
		if (Date.now() > deadline) assert.fail(`timed out waiting for: ${what}`);
		await new Promise(r => setTimeout(r, 10));
	}
}
const indexPassRunning = (): boolean => services.board.snapshot().indexing.index.processing;

/** Keep an LMDB write transaction open on the store worker for `ms`; resolves once it is open. */
function holdWriteTxn(ms: number): { open: Promise<void>; done: Promise<void> } {
	let opened!: () => void;
	const open = new Promise<void>(r => { opened = r; });
	const done = new Promise<void>(resolve => {
		const on = (m: { op?: string; started?: boolean; ok?: boolean }): void => {
			if (m.op !== 'hold-write-txn') return;
			if (m.started === true) opened();
			if (m.ok === true) { writer.worker.off('message', on); resolve(); }
		};
		writer.worker.on('message', on);
	});
	writer.worker.postMessage({ op: 'hold-write-txn', ms });
	return { open, done };
}

before(async () => {
	declareLiveStoreOwner();
	const db = await getDb();
	await initDb(db);
	const port = new IndexingPortClient((method, params) => router.request('indexing', method, params), services.board);
	const runtime = buildHandlerRuntime({
		db, configStore: {} as never, queue: port, indexer: port, startedAt: Date.now(),
		shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
	});
	local = directDispatch(runtime.rpcHandlers, runtime.streamHandlers);
	indexing = startIndexingWorkers(supervisor, services.indexingBlock);
	await indexing.ready;
	await supervisor.start({ name: 'admin', cls: 'admin', script: 'admin-worker' });
	writer = await supervisor.start({ name: 'store-writer', script: '__tests__/helpers/store-worker', extra: () => ({ workerData: { declare: true, supervised: true }, transferList: [] }) });
	// A repository large enough for a full index that outlasts the measurements.
	mkdirSync(join(REPO, 'src'), { recursive: true });
	for (let i = 0; i < FILES; i++) {
		writeFileSync(join(REPO, 'src', `m${i}.ts`), `export function f${i}(x: number): number { return x + ${i}; }\nexport class C${i} { m(): number { return f${i}(1); } }\n`);
	}
});
after(async () => {
	await indexing.stop();
	await supervisor.terminateAll();
	await closeLanceConn();
	await closeGraphStore();
	for (const d of [HOME, REPO]) rmSync(d, { recursive: true, force: true });
});

test('daemon.status, repo.list, debug-status, config.show, config.catalog and guide.list answer within 100 ms (p99 over 50 calls) while an indexing pass runs and another worker keeps an LMDB write transaction open', { timeout: 300_000 }, async () => {
	await addRepo(await getDb(), { path: REPO, name: 'big', addedAt: new Date().toISOString(), status: 'pending' });
	assert.equal((await ask('repo.reindex', { path: REPO })).error, undefined);
	await until(indexPassRunning, 'the indexing pass');
	const txn = holdWriteTxn(20_000);
	await txn.open;

	const p99: Record<string, number> = {};
	for (const [method, params] of ADMIN_METHODS) {
		const times: number[] = [];
		for (let i = 0; i < CALLS; i++) {
			const t0 = performance.now();
			const reply = await ask(method, params);
			times.push(performance.now() - t0);
			assert.equal(reply.error, undefined, `${method}: ${reply.error}`);
		}
		times.sort((a, b) => a - b);
		p99[method] = times[Math.ceil(0.99 * times.length) - 1]!;
	}
	assert.ok(indexPassRunning(), 'the indexing pass was still running after the measurements');
	for (const [method, ms] of Object.entries(p99)) assert.ok(ms <= 100, `${method}: p99 ${ms.toFixed(1)} ms (all: ${JSON.stringify(p99)})`);
	await txn.done;
});

test('a session request on the main thread is answered while an indexing pass runs', { timeout: 300_000 }, async () => {
	if (!indexPassRunning()) assert.equal((await ask('repo.reindex', { path: REPO })).error, undefined);
	await until(indexPassRunning, 'the indexing pass');
	const t0 = performance.now();
	const reply = await ask('session.list', {});
	const ms = performance.now() - t0;
	assert.equal(reply.error, undefined, reply.error);
	assert.ok(Array.isArray(reply.result), 'session.list answered on the main thread');
	assert.ok(indexPassRunning(), 'while the pass was still running');
	assert.ok(ms < 1_000, `answered in ${ms.toFixed(1)} ms`);
	await until(() => services.board.snapshot().indexing.idle, 'the pass to finish', 240_000);
});

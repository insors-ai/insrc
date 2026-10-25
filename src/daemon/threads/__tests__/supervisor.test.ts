/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The worker supervisor (Epic 86197ac6, Story s2, t14): a worker that exits
 * fails its in-flight requests, has its locks and store-guard permits
 * reclaimed and is replaced while the other threads keep serving; past five
 * restarts in 60 s the daemon shuts down.
 *
 * Workers exit through test hooks (INSRC_TEST_HOOKS=1): a request or push that
 * ends the worker with code 1, the code-indexing worker after closing its
 * watcher (a native watcher call cut off by a worker's end aborts the process).
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/supervisor.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-supervisor-'));
process.env['HOME'] = HOME;
process.env['INSRC_TEST_HOOKS'] = '1';
process.env['INSRC_TEST_STUB_SUMMARISER'] = '1';

const { closeGraphStore, declareLiveStoreOwner } = await import('../../../db/graph/store.js');
const { closeLanceConn } = await import('../../../db/lance/conn.js');
const { getDb, initDb } = await import('../../../db/client.js');
const { addRepo } = await import('../../../db/repos.js');
const { getStoreGuard } = await import('../../../db/store-guard.js');
const { getLockManager } = await import('../../../shared/locks/lock-manager.js');
const { directDispatch } = await import('../../server.js');
const { ThreadServices } = await import('../main-services.js');
const { methodClasses } = await import('../method-class.js');
const { Router } = await import('../router.js');
const { Supervisor } = await import('../supervisor.js');
const { CODE_INDEXING_WORKER, SUMMARY_WORKER, startIndexingWorkers } = await import('../indexing-workers.js');
const { TEST_EXIT_METHOD } = await import('../worker-requests.js');
const { pushToWorker } = await import('../channel.js');
import type { ReplyEnvelope, RequestEnvelope } from '../channel.js';
import type { Worker } from 'node:worker_threads';

const DOCS = 30;
const REPO = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-supervisor-repo-')));
const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }));
const router = new Router({ classOf: methodClasses.classOf, registry: services.registry, routed: new Set(['admin', 'indexing']), local: directDispatch({}) });
const shutdowns: string[] = [];
const supervisor = new Supervisor({ services, router, shutdown: reason => { shutdowns.push(reason); } });
let indexing: ReturnType<typeof startIndexingWorkers>;
/** Summaries the stub reported, with the thread of the summary worker that ran each. */
const summarised: { id: string; threadId: number }[] = [];
const watched = new Set<Worker>();

let seq = 0;
/** Ask the router as a socket would; resolves with the reply envelope. */
function ask(method: string, params: unknown = {}): Promise<ReplyEnvelope> {
	const requestId = `s${++seq}`;
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
/** Record what each summary worker summarises, the current one and every replacement. */
function watchSummaries(): void {
	const current = supervisor.current(SUMMARY_WORKER);
	if (current === undefined || watched.has(current.worker)) return;
	watched.add(current.worker);
	const threadId = current.threadId;
	current.worker.on('message', (m: { summarised?: string }) => { if (m.summarised !== undefined) summarised.push({ id: m.summarised, threadId }); });
}
const threadOf = (name: string): number | undefined => supervisor.current(name)?.threadId;

before(async () => {
	declareLiveStoreOwner();
	const db = await getDb();
	await initDb(db);
	mkdirSync(join(REPO, 'docs'), { recursive: true });
	mkdirSync(join(REPO, 'src'), { recursive: true });
	for (let i = 0; i < DOCS; i++) writeFileSync(join(REPO, 'docs', `d${i}.md`), `# Document ${i}\n\nParagraph ${i} about the fixture.\n`);
	writeFileSync(join(REPO, 'src', 'a.ts'), 'export function alpha(): number { return 1; }\n');
	await addRepo(db, { path: REPO, name: 'fixture', addedAt: new Date().toISOString(), status: 'pending' });

	indexing = startIndexingWorkers(supervisor, services.indexingBlock);
	await indexing.ready;
	await supervisor.start({ name: 'admin', cls: 'admin', script: 'admin-worker' });
	watchSummaries();
	await until(() => summarised.length >= DOCS && services.board.snapshot().indexing.idle, 'the first sweep');
});
after(async () => {
	await indexing.stop();
	await supervisor.terminateAll();
	await closeLanceConn();
	await closeGraphStore();
	for (const d of [HOME, REPO]) rmSync(d, { recursive: true, force: true });
});

test('admin, code-indexing and summary workers killed in turn: in-flight requests error, the worker is replaced, other threads keep serving', { timeout: 120_000 }, async () => {
	// The admin worker.
	const admin = threadOf('admin')!;
	const adminDeath = router.request('admin', TEST_EXIT_METHOD, null);
	await assert.rejects(adminDeath, { message: `the daemon's admin thread stopped while serving ${TEST_EXIT_METHOD}; retry` });
	const statsMeanwhile = await ask('repo.stats', {});
	assert.equal(statsMeanwhile.error, undefined, 'the code-indexing worker answered while the admin worker was replaced');
	const status = await ask('daemon.status');
	assert.equal(status.error, undefined, 'daemon.status was answered, by the replacement');
	assert.ok(threadOf('admin') !== undefined && threadOf('admin') !== admin, 'a new admin worker');

	// The code-indexing worker.
	const code = threadOf(CODE_INDEXING_WORKER)!;
	const codeDeath = router.request('indexing', TEST_EXIT_METHOD, null);
	await assert.rejects(codeDeath, { message: `the daemon's indexing thread stopped while serving ${TEST_EXIT_METHOD}; retry` });
	assert.equal((await ask('daemon.status')).error, undefined, 'the admin worker answered while the code-indexing worker was replaced');
	const stats = await ask('repo.stats', { repoPath: REPO });
	assert.equal(stats.error, undefined, 'repo.stats waited for the new code-indexing worker');
	assert.ok(threadOf(CODE_INDEXING_WORKER) !== undefined && threadOf(CODE_INDEXING_WORKER) !== code, 'a new code-indexing worker');
	// The new code-indexing worker reached the summary worker over a new channel: a reindex is summarised.
	await until(() => services.board.snapshot().indexing.idle, 'the restarted indexer idle');
	const before = summarised.length;
	assert.equal((await ask('repo.reindex', { path: REPO })).error, undefined);
	await until(() => summarised.length >= before + DOCS && services.board.snapshot().indexing.idle, 'a sweep through the new code-indexing worker');

	// The document-summary worker, mid-sweep.
	const summary = supervisor.current(SUMMARY_WORKER)!;
	const midSweep = summarised.length;
	assert.equal((await ask('repo.reindex', { path: REPO })).error, undefined);
	await until(() => summarised.length >= midSweep + 3, 'the next sweep under way');
	pushToWorker(summary.port, TEST_EXIT_METHOD, null);
	await until(() => threadOf(SUMMARY_WORKER) !== undefined && threadOf(SUMMARY_WORKER) !== summary.threadId, 'a new summary worker');
	watchSummaries();
	assert.equal((await ask('repo.stats', {})).error, undefined, 'the code-indexing worker answered while the summary worker was replaced');
	// The interrupted job failed and the lane went on: the lanes go idle, and the next sweep runs on the new worker.
	await until(() => services.board.snapshot().indexing.idle, 'the lanes idle after the abandoned sweep');
	assert.equal((await ask('repo.reindex', { path: REPO })).error, undefined);
	const replacement = threadOf(SUMMARY_WORKER)!;
	await until(() => summarised.filter(s => s.threadId === replacement).length >= DOCS && services.board.snapshot().indexing.idle, 'a sweep on the new summary worker');
	assert.deepEqual(shutdowns, [], 'three restarts are within the limit');
});

test('a sixth restart within 60 s shuts the daemon down', { timeout: 60_000 }, async () => {
	// One second between exits: the sixth exit finds five restarts in the window.
	let clock = 0;
	const reasons: string[] = [];
	const flaky = new Supervisor({ services, router, shutdown: r => { reasons.push(r); }, now: () => (clock += 1_000) });
	const starts: number[] = [];
	await flaky.start({ name: 'flaky', script: '__tests__/helpers/exit-worker', started: w => { starts.push(w.threadId); } });
	await until(() => reasons.length > 0, 'the shutdown');
	assert.equal(starts.length, 6, 'the first start and five restarts');
	assert.deepEqual(reasons, ['the flaky worker exceeded the restart limit']);
	await new Promise(r => setTimeout(r, 300));
	assert.equal(starts.length, 6, 'no seventh start');
	assert.equal(flaky.current('flaky'), undefined);

	// Restarts spread wider than the window never reach the limit.
	let slowClock = 0;
	const calm: string[] = [];
	const spread = new Supervisor({ services, router, shutdown: r => { calm.push(r); }, now: () => (slowClock += 13_000) });
	let spreadStarts = 0;
	await spread.start({ name: 'spread', script: '__tests__/helpers/exit-worker', started: () => { spreadStarts++; } });
	await until(() => spreadStarts >= 9, 'eight restarts');
	spread.stop();
	await spread.terminateAll();
	assert.deepEqual(calm, [], 'five restarts per 60 s at most, never six');
});

test("a dead worker's store-guard permits and named locks are reclaimed before its replacement starts", { timeout: 60_000 }, async () => {
	const lockName = 't14.reclaim';
	let dead: number | undefined;
	let atReplacement: { locks: number; permits: number } | undefined;
	let starts = 0;
	const hold = new Supervisor({ services, router, shutdown: () => {} });
	const first = await hold.start({
		name: 'holder', script: '__tests__/helpers/hold-worker',
		extra: () => {
			// What the dead worker still held at the moment its replacement starts.
			if (++starts === 2) {
				atReplacement = {
					locks: getLockManager().query().held.filter(l => l.name === lockName).length,
					permits: getStoreGuard().holders().filter(h => h.threadId === dead).length,
				};
			}
			return { workerData: { hold: starts === 1, lockName }, transferList: [] };
		},
	});
	dead = first.threadId;
	await new Promise<void>(resolve => first.worker.on('message', m => { if (m === 'holding') resolve(); }));
	assert.equal(getLockManager().query().held.filter(l => l.name === lockName && l.threadId === dead).length, 1, 'the worker holds the lock');
	assert.equal(getStoreGuard().holders().filter(h => h.threadId === dead && h.store === 'duckdb').length, 1, 'and a duckdb permit');
	first.worker.postMessage('exit');
	await until(() => hold.current('holder') !== undefined && hold.current('holder') !== first, 'the replacement');
	assert.deepEqual(atReplacement, { locks: 0, permits: 0 }, 'both were reclaimed before the replacement started');
	hold.stop();
	await hold.terminateAll();
});

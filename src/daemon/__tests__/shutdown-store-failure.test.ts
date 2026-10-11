/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * How a daemon ends once its graph store has lost its locks (Epic c2ba6fa6,
 * Story s4, t7). Before this, a stop left the daemon hung for ever: both ends
 * of the shutdown called process.exit, whose exit hook in the store library
 * never returns in that state.
 *
 * The child process here is not a whole daemon, but what ends it is the
 * daemon's own code: createShutdown, reportFatal, the request server, the job
 * queue and the status builder, on a store broken by the real sequence.
 *
 * Run: npx tsx --test src/daemon/__tests__/shutdown-store-failure.test.ts
 */

import { after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';

import { createShutdown, endAfterStoreFailure, exitRespectingStoreHealth, lastLineFor } from '../shutdown.js';
import type { EndDeps } from '../shutdown.js';
import type { StoreHealth } from '../../db/graph/store.js';
import type { DaemonStatus } from '../../shared/types.js';
import { killAllStoreChildren, runLockLossSequence, spawnStoreChild } from '../../db/graph/__tests__/helpers/store-child-driver.js';
import type { StoreChild } from '../../db/graph/__tests__/helpers/store-child-driver.js';

// A short root: each child's request socket lives under it (path limit ~104 bytes).
const base = mkdtempSync('/tmp/insrc-shutdown-');
afterEach(() => { killAllStoreChildren(); });
after(() => {
	killAllStoreChildren();
	rmSync(base, { recursive: true, force: true });
});

const skip = process.platform === 'win32';

interface Home { home: string; store: string; log: string; crashDir: string; pid: string; sock: string; }
function tempHome(name: string): Home {
	const home = join(base, name);
	mkdirSync(join(home, '.insrc'), { recursive: true });
	return {
		home, store: join(home, 'graph.lmdb'), log: join(home, 'daemon.log'), crashDir: join(home, 'crash'),
		pid: join(home, '.insrc/daemon.pid'), sock: join(home, '.insrc/daemon.sock'),
	};
}

/** One request over the child's socket. Resolves with the answer, or with
 *  'closed' when the connection ends without one. */
function ask(sock: string, method: string, params: unknown = {}): Promise<{ result?: unknown; error?: string } | 'closed'> {
	return new Promise((resolve, reject) => {
		const c = createConnection(sock);
		let buf = '';
		// Never wait for ever on a process that neither answers nor ends.
		const timer = setTimeout(() => { c.destroy(); reject(new Error(`no answer to ${method} within 10 s`)); }, 10_000);
		c.on('connect', () => c.write(`${JSON.stringify({ id: 1, method, params })}\n`));
		c.on('data', d => {
			buf += String(d);
			const nl = buf.indexOf('\n');
			if (nl < 0) return;
			clearTimeout(timer);
			c.end();
			resolve(JSON.parse(buf.slice(0, nl)) as { result?: unknown; error?: string });
		});
		c.on('close', () => { clearTimeout(timer); resolve('closed'); });
		c.on('error', e => { clearTimeout(timer); reject(e); });
	});
}

async function becomeDaemon(child: StoreChild, h: Home): Promise<void> {
	const r = await child.send({ op: 'daemon-like', logPath: h.log, crashLogDir: h.crashDir });
	assert.ok(r.ok, r.ok ? '' : r.message);
	assert.ok(existsSync(h.pid) && existsSync(h.sock), 'pid file and socket are in place');
}

/** A child with a store broken by the real sequence, serving as a daemon. */
async function brokenDaemon(name: string): Promise<{ child: StoreChild; h: Home }> {
	const h = tempHome(name);
	const child = await runLockLossSequence(h.store, { env: { HOME: h.home } });
	await becomeDaemon(child, h);
	return { child, h };
}

async function endedWithin(child: StoreChild, ms: number): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
	const started = Date.now();
	const how = await Promise.race([child.exited, new Promise<'still running'>(r => setTimeout(() => r('still running'), ms))]);
	assert.notEqual(how, 'still running', `the process ended within ${ms} ms`);
	assert.ok(Date.now() - started < ms);
	return how as { code: number | null; signal: NodeJS.Signals | null };
}

function assertLastLine(h: Home, reason: RegExp): void {
	const lines = readFileSync(h.log, 'utf8').trimEnd().split('\n');
	const last = lines[lines.length - 1] ?? '';
	assert.match(last, reason);
	assert.match(last, /the graph store's close was skipped because the store lost its locks/);
	assert.doesNotMatch(last, /semume/);
}

test('status after failure: storeFailure names another process and does not contain \'semume\'', { skip }, async () => {
	const { child, h } = await brokenDaemon('status');
	const answer = await ask(h.sock, 'daemon.status');
	assert.notEqual(answer, 'closed');
	const status = (answer as { result: DaemonStatus }).result;
	assert.deepEqual(status.repos, [], 'answered, with an empty repository list');
	assert.equal(status.storeFailure?.kind, 'locks-lost');
	assert.equal(status.storeFailure?.operation, 'request daemon.status');
	assert.match(status.storeFailure?.cause ?? '', /Another process/);
	assert.doesNotMatch(JSON.stringify(status), /semume/);
	// It goes on answering.
	const again = await ask(h.sock, 'daemon.status');
	assert.equal((again as { result: DaemonStatus }).result.storeFailure?.kind, 'locks-lost');
	await child.kill();
});

test('store failure to stop: exit within 5 seconds, pid file and socket gone, second start succeeds, last log line names the skipped close', { skip }, async () => {
	// (a) the failure is known to the daemon when the stop arrives;
	// (b) nothing has met it yet: the shutdown itself must find it.
	for (const known of [true, false]) {
		const { child, h } = await brokenDaemon(`stop-${known ? 'known' : 'unknown'}`);
		if (known) await ask(h.sock, 'daemon.status');

		const answer = await ask(h.sock, 'daemon.shutdown');
		if (known) assert.deepEqual(answer, { id: 1, result: { ok: true } }, 'the stop request is answered before the process ends');
		const how = await endedWithin(child, 5_000);
		assert.equal(how.signal, 'SIGKILL', 'ended by a kill to itself, not by an exit (whose hook would hang)');
		assert.equal(existsSync(h.pid), false, 'pid file removed');
		assert.equal(existsSync(h.sock), false, 'socket removed');
		assertLastLine(h, /ending after shutdown \(daemon\.shutdown RPC\)/);

		// A second start in the same home, on the same store, succeeds.
		const second = await spawnStoreChild(h.store, { env: { HOME: h.home } });
		assert.deepEqual(await second.send({ op: 'open' }), { ok: true });
		await becomeDaemon(second, h);
		assert.deepEqual(await second.send({ op: 'wrapper-async', key: 'after', probeAfterMs: 10_000 }), { ok: true });
		const status = await ask(h.sock, 'daemon.status');
		assert.equal('storeFailure' in (status as { result: DaemonStatus }).result, false, 'the new process is healthy');
		await second.kill();
	}
});

test('fatal after failure: an unhandled rejection with the store failed ends the process within 5 seconds', { skip }, async () => {
	const { child, h } = await brokenDaemon('fatal');
	await ask(h.sock, 'daemon.status');   // the failure is recorded

	await child.send({ op: 'reject-unhandled' });
	const how = await endedWithin(child, 5_000);
	assert.equal(how.signal, 'SIGKILL');
	assert.equal(existsSync(h.pid), false, 'pid file removed');
	assert.equal(existsSync(h.sock), false, 'socket removed');
	assertLastLine(h, /ending after a fatal error \(unhandledRejection\)/);
	assert.match(readFileSync(join(h.crashDir, 'daemon.crash.log'), 'utf8'), /\[unhandledRejection\] nothing handles this/, 'the crash log is still written');
});

test('healthy shutdown is unchanged: queue drained, connections closed in order, normal exit', { skip }, async () => {
	// --- The order, with every act observed.
	const acts: string[] = [];
	let release: () => void = () => {};
	const queueDone = new Promise<void>(res => { release = res; });
	const health: StoreHealth = { state: 'ok' };
	const end: EndDeps = {
		clearPid: () => { acts.push('clearPid'); },
		exit: code => { acts.push(`exit(${code})`); },
		killSelf: () => { acts.push('KILL'); },
		lastLinePath: join(base, 'never-written.log'),
		storeHealth: () => health,
	};
	const shutdown = createShutdown({
		log: { info: () => {}, warn: () => {} },
		stopBackgroundWork: () => { acts.push('stopBackgroundWork'); },
		queueDone,
		closeStores: async () => { acts.push('closeStores'); },
		end,
	});
	shutdown('SIGTERM');
	shutdown('SIGINT');   // a second signal is ignored
	await new Promise(r => setTimeout(r, 120));
	assert.deepEqual(acts, ['stopBackgroundWork'], 'nothing closes and nothing exits while the queue drains');
	release();
	await new Promise(r => setTimeout(r, 20));
	assert.deepEqual(acts, ['stopBackgroundWork', 'closeStores', 'clearPid', 'exit(0)']);
	assert.equal(existsSync(end.lastLinePath), false);

	// --- A real process: a job in flight is finished before the exit.
	const h = tempHome('healthy');
	const child = await spawnStoreChild(h.store, { env: { HOME: h.home } });
	assert.deepEqual(await child.send({ op: 'open' }), { ok: true });
	await becomeDaemon(child, h);
	await ask(h.sock, 'test.enqueue', { ms: 400, key: 'drained' });
	assert.deepEqual(await ask(h.sock, 'daemon.shutdown'), { id: 1, result: { ok: true } });
	const how = await endedWithin(child, 5_000);
	assert.deepEqual(how, { code: 0, signal: null }, 'a normal exit, not a kill');
	assert.equal(existsSync(h.pid), false);
	assert.equal(existsSync(h.sock), false);
	assert.equal(existsSync(h.log), false, 'no last line: that is only for a failed store');

	const reader = await spawnStoreChild(h.store, { env: { HOME: h.home } });
	await reader.send({ op: 'open' });
	assert.deepEqual(await reader.send({ op: 'read', key: 'drained' }), { ok: true, value: '1' }, 'the job in flight was finished');
	await reader.kill();
});

test('with the store failed no path calls exit: the shutdown, its backstop, a failure found during the drain, and any other exit', async () => {
	const lost: StoreHealth = { state: 'locks-lost', at: '2026-10-11T10:00:00.000Z', operation: 'request search', detectedBy: 'read', libraryMessage: 'MDB_LOCK_FAILURE (kern.sysv.semume)' };
	const scene = (health: () => StoreHealth, name: string) => {
		const acts: string[] = [];
		const end: EndDeps = {
			clearPid: () => { acts.push('clearPid'); },
			exit: code => { acts.push(`exit(${code})`); },
			killSelf: () => { acts.push('KILL'); },
			lastLinePath: join(base, `${name}.log`),
			storeHealth: health,
		};
		return { acts, end };
	};

	// The shutdown: no wait for a queue that never drains, no store close.
	const a = scene(() => lost, 'a');
	createShutdown({
		log: { info: () => {}, warn: () => {} },
		stopBackgroundWork: () => { a.acts.push('stopBackgroundWork'); },
		queueDone: new Promise(() => {}),
		closeStores: async () => { a.acts.push('closeStores'); },
		end: a.end,
	})('SIGTERM');
	await new Promise(r => setTimeout(r, 150));
	assert.deepEqual(a.acts, ['stopBackgroundWork', 'clearPid', 'KILL']);
	assert.equal(readFileSync(a.end.lastLinePath, 'utf8').replace(/^\[insrc-daemon\]\[[^\]]*\]/, ''), lastLineFor('shutdown (SIGTERM)', lost).replace(/^\[insrc-daemon\]\[[^\]]*\]/, ''));

	// The failure is found while the queue drains: the close is skipped.
	let now: StoreHealth = { state: 'ok' };
	let release: () => void = () => {};
	const b = scene(() => now, 'b');
	createShutdown({
		log: { info: () => {}, warn: () => {} },
		stopBackgroundWork: () => {},
		queueDone: new Promise<void>(res => { release = res; }),
		closeStores: async () => { b.acts.push('closeStores'); },
		end: b.end,
	})('SIGTERM');
	now = lost;
	release();
	await new Promise(r => setTimeout(r, 30));
	assert.deepEqual(b.acts, ['clearPid', 'KILL']);

	// The backstop, with the queue stalled and the store failed meanwhile.
	now = { state: 'ok' };
	const c = scene(() => now, 'c');
	createShutdown({
		log: { info: () => {}, warn: () => {} },
		stopBackgroundWork: () => {},
		queueDone: new Promise(() => {}),
		closeStores: async () => { c.acts.push('closeStores'); },
		end: c.end,
		hardExitMs: 40,
	})('SIGTERM');
	now = lost;
	await new Promise(r => setTimeout(r, 120));
	assert.ok(c.acts.includes('KILL') && !c.acts.some(x => x.startsWith('exit')), `backstop ends by kill (${c.acts.join(',')})`);

	// Any other exit.
	const d = scene(() => lost, 'd');
	exitRespectingStoreHealth(1, 'a failed start', d.end);
	assert.deepEqual(d.acts, ['clearPid', 'KILL']);
	const e = scene(() => ({ state: 'ok' }), 'e');
	exitRespectingStoreHealth(1, 'a failed start', e.end);
	assert.deepEqual(e.acts, ['exit(1)']);

	// The last line survives a pid file that cannot be removed.
	const f = scene(() => lost, 'f');
	endAfterStoreFailure('x', lost as Exclude<StoreHealth, { state: 'ok' }>, { ...f.end, clearPid: () => { throw new Error('EPERM'); } });
	assert.deepEqual(f.acts, ['KILL']);
	assert.match(readFileSync(f.end.lastLinePath, 'utf8'), /ending after x: the graph store's close was skipped/);
});

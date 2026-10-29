/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic 86197ac6, Story s3 / t7: the session pool (sc6), over a fake worker starter. One
 * worker per session, started once however many ask; the unattributed worker for requests
 * with no identity; the idle sweep's release rules; a start failure answered to every
 * waiter and retried by the next request; daemon.threads.sessionIdleMs.
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-session-pool-'));
process.env['HOME'] = HOME;
after(() => rmSync(HOME, { recursive: true, force: true }));

const { SessionPool, SessionWorkerStartError } = await import('../session-pool.js');
const { TargetRegistry } = await import('../registry.js');
const { DEFAULT_SESSION_IDLE_MS, sessionIdleMs } = await import('../main-services.js');
const { CONFIG_CATALOG } = await import('../../../config/config-catalog.js');
const { PATHS } = await import('../../../shared/paths.js');
import type { StartedWorker } from '../workers.js';

/** A fake started worker: terminate() records itself and emits no exit (a release, not a crash). */
function fakeWorkers(): { start: (name: string, opts?: unknown, onCreated?: (w: StartedWorker['worker']) => void) => Promise<StartedWorker>; starts: string[]; terminated: number[]; disconnected: number[]; fail: (reason: string | undefined) => void; gate: (p: Promise<void> | undefined) => void } {
	let next = 100;
	const starts: string[] = [];
	const terminated: number[] = [];
	const disconnected: number[] = [];
	let failWith: string | undefined;
	let wait: Promise<void> | undefined;
	return {
		starts, terminated, disconnected,
		fail: reason => { failWith = reason; },
		gate: p => { wait = p; },
		start: async (name, _opts, onCreated) => {
			starts.push(name);
			const threadId = next++;
			const worker = Object.assign(new EventEmitter(), { threadId, terminate: async () => { terminated.push(threadId); return 0; } });
			// Created before it is ready, as startWorker hands it over.
			onCreated?.(worker as unknown as StartedWorker['worker']);
			if (wait !== undefined) await wait;
			if (failWith !== undefined) throw new Error(failWith);
			return { worker: worker as unknown as StartedWorker['worker'], threadId, port: new MessageChannel().port1, reclaimed: Promise.resolve({ locks: [], stores: { released: [], unhealthy: [] } }), disconnect: () => { disconnected.push(threadId); } };
		},
	};
}

function pool(opts: { idleTimeoutMs?: number; runs?: Map<number, number>; alive?: Set<number>; now?: () => number; onCreated?: (w: StartedWorker['worker'], name: string) => void; restarted?: (name: string) => boolean } = {}) {
	const workers = fakeWorkers();
	const registry = new TargetRegistry();
	const attached: number[] = [];
	const detached: number[] = [];
	const p = new SessionPool({
		options: { idleTimeoutMs: opts.idleTimeoutMs ?? 1_000 },
		registry, start: workers.start,
		attach: id => attached.push(id), detach: id => detached.push(id),
		activeRuns: id => opts.runs?.get(id) ?? 0,
		...(opts.now !== undefined ? { now: opts.now } : {}),
		pidAlive: pid => opts.alive === undefined || opts.alive.has(pid),
		...(opts.onCreated !== undefined ? { onCreated: opts.onCreated } : {}),
		...(opts.restarted !== undefined ? { restarted: opts.restarted } : {}),
	});
	return { p, workers, registry, attached, detached };
}

test('session pool: concurrent workerFor calls for one session start one worker', async () => {
	const { p, workers, registry, attached } = pool();
	let open!: () => void;
	workers.gate(new Promise<void>(r => { open = r; }));
	const mcp = { label: 'mcp', pid: 4242 };
	const asked = [p.workerFor(mcp), p.workerFor(mcp), p.workerFor({ label: 'mcp', pid: 4242 })];
	open();
	const infos = await Promise.all(asked);
	assert.equal(workers.starts.length, 1, 'one start for the three asks');
	assert.ok(infos.every(i => i.threadId === infos[0]!.threadId));
	assert.equal(registry.targetFor('session', mcp)?.threadId, infos[0]!.threadId, "registered under the session's slot");
	assert.deepEqual(attached, [infos[0]!.threadId], 'attached to the router once');
	// Another session gets its own worker.
	const other = await p.workerFor({ label: 'mcp', pid: 5151 });
	assert.notEqual(other.threadId, infos[0]!.threadId);
	assert.equal(p.sessions().length, 2);
});

test('session pool: idle and pid-gone release at the sweep; never a worker with an active run or a request in flight', async () => {
	let clock = 0;
	const runs = new Map<number, number>();
	const alive = new Set([1, 2, 3, 4]);
	const { p, workers, registry, detached } = pool({ idleTimeoutMs: 1_000, runs, alive, now: () => clock });
	const idle = await p.workerFor({ label: 'a', pid: 1 });
	const gone = await p.workerFor({ label: 'b', pid: 2 });
	const running = await p.workerFor({ label: 'c', pid: 3 });
	const busy = await p.workerFor({ label: 'd', pid: 4 });
	runs.set(running.threadId, 1);
	p.started({ label: 'd', pid: 4 });          // a request in flight on d
	clock = 500;
	alive.delete(2);                             // b's client process exited
	await p.sweep();
	assert.deepEqual(workers.terminated, [gone.threadId], 'only the session whose process is gone, before the idle timeout');
	assert.equal(registry.targetFor('session', { label: 'b', pid: 2 }), undefined, 'its slot unregistered');
	assert.ok(detached.includes(gone.threadId));
	clock = 2_000;                               // past the idle timeout for all
	await p.sweep();
	assert.deepEqual(workers.terminated.sort(), [gone.threadId, idle.threadId].sort(), 'the idle one too; not the one with a running run, not the busy one');
	assert.ok(registry.targetFor('session', { label: 'c', pid: 3 }) !== undefined);
	assert.ok(registry.targetFor('session', { label: 'd', pid: 4 }) !== undefined);
	// Once the run ends and the request ends, they go at the next sweep after the idle timeout.
	runs.delete(running.threadId);
	p.ended({ label: 'd', pid: 4 });
	clock = 2_500;
	await p.sweep();
	assert.ok(!workers.terminated.includes(busy.threadId), 'd was active half a timeout ago: kept');
	assert.ok(workers.terminated.includes(running.threadId), 'c idle since its start: released');
	clock = 4_000;
	await p.sweep();
	assert.ok(workers.terminated.includes(busy.threadId));
	assert.equal(p.sessions().length, 0);
});

test('session pool: start failure answers waiting requests with SessionWorkerStartError and the next request retries', async () => {
	const { p, workers, registry } = pool();
	let open!: () => void;
	workers.gate(new Promise<void>(r => { open = r; }));
	workers.fail('the worker script did not load');
	const mcp = { label: 'mcp', pid: 77 };
	const waiting = [p.workerFor(mcp), p.workerFor(mcp)];
	open();
	for (const w of waiting) {
		await assert.rejects(w, (err: Error) => err instanceof SessionWorkerStartError && err.message === 'session worker could not start: the worker script did not load');
	}
	assert.equal(workers.starts.length, 1, 'one failed start, answered to both waiters');
	assert.equal(registry.targetFor('session', mcp), undefined, 'nothing registered');
	workers.gate(undefined);
	workers.fail(undefined);
	const info = await p.workerFor(mcp);
	assert.equal(workers.starts.length, 2, 'the next request tried again');
	assert.equal(registry.targetFor('session', mcp)?.threadId, info.threadId);
});

test('session pool: the unattributed worker starts once under session:unattributed; sessionIdleMs default 900000 from config', async () => {
	const { p, workers, registry } = pool();
	const first = await p.workerFor();
	const second = await p.workerFor(undefined);
	assert.equal(workers.starts.length, 1);
	assert.deepEqual(workers.starts, ['unattributed']);
	assert.equal(first.threadId, second.threadId);
	assert.equal(first.session, undefined);
	const target = registry.targetFor('session');
	assert.equal(target?.threadId, first.threadId);
	assert.equal(target?.unattributed, true, "the 'session:unattributed' slot");
	assert.equal(registry.targetFor('session', { label: 'mcp', pid: 1 }), undefined, 'not any session\'s worker');
	// The config key: in the catalog with its default, read from config.json at start.
	const option = CONFIG_CATALOG.find(o => o.path === 'daemon.threads.sessionIdleMs');
	assert.equal(option?.default, 900_000);
	assert.equal(DEFAULT_SESSION_IDLE_MS, 900_000);
	assert.equal(sessionIdleMs(), 900_000, 'no config file: the default');
	mkdirSync(join(HOME, '.insrc'), { recursive: true });
	writeFileSync(PATHS.config, JSON.stringify({ daemon: { threads: { sessionIdleMs: 60_000 } } }));
	assert.equal(sessionIdleMs(), 60_000, 'the configured value');
	writeFileSync(PATHS.config, JSON.stringify({ daemon: { threads: { sessionIdleMs: -5 } } }));
	assert.equal(sessionIdleMs(), 900_000, 'an invalid value falls back to the default');
});

test('session pool: a worker that exits is unregistered and disconnected from its main-thread services', async () => {
	const { p, workers, registry, detached } = pool();
	const mcp = { label: 'mcp', pid: 4250 };
	const info = await p.workerFor(mcp);
	assert.deepEqual(workers.disconnected, [], 'connected while it runs');
	// The fake's worker is the EventEmitter the pool listens on: a crash is its exit event.
	const entryWorker = (p as unknown as { entries: Map<string, { started: { worker: EventEmitter } }> }).entries.get('session:mcp:4250')!.started.worker;
	entryWorker.emit('exit', 1);
	await new Promise(r => setTimeout(r, 10));
	assert.deepEqual(workers.disconnected, [info.threadId], 'disconnected once reclaimed, as a release does');
	assert.deepEqual(detached, [info.threadId]);
	assert.equal(registry.targetFor('session', mcp), undefined, 'its slot is unregistered');
	assert.equal(p.sessions().length, 0);
});

test('session pool: a request sent straight to a worker (startedOn) keeps it from the idle sweep until endedOn', async () => {
	let now = 0;
	const { p, workers } = pool({ idleTimeoutMs: 1_000, now: () => now });
	const info = await p.workerFor({ label: 'mcp', pid: 4251 });
	p.startedOn(info.threadId);
	now = 5_000;
	await p.sweep();
	assert.deepEqual(workers.terminated, [], 'busy with the request: not released');
	p.endedOn(info.threadId);
	await p.sweep();
	assert.deepEqual(workers.terminated, [], 'its end counts as activity: not idle yet');
	now = 7_000;
	await p.sweep();
	assert.deepEqual(workers.terminated, [info.threadId], 'released once idle after it ended');
});

test('session pool: close waits for a start under way, releases that worker too, and refuses any later start', async () => {
	const { p, workers } = pool();
	let open!: () => void;
	workers.gate(new Promise<void>(r => { open = r; }));
	const starting = p.workerFor({ label: 'mcp', pid: 4252 });
	const closing = p.close();
	open();
	const info = await starting;
	await closing;
	assert.deepEqual(workers.terminated, [info.threadId], 'the worker that finished starting during close was released');
	await assert.rejects(p.sharedWorker(), (err: unknown) => err instanceof SessionWorkerStartError && /shutting down/.test(err.message));
	await assert.rejects(p.workerFor({ label: 'mcp', pid: 4253 }), SessionWorkerStartError);
	assert.equal(workers.starts.length, 1, 'no start after close began');
	assert.equal(p.sessions().length, 0);
});

test('session pool: every created worker is handed to onCreated; a refused shared-state restart rejects with SessionWorkerStartError', async () => {
	const created: string[] = [];
	const asked: string[] = [];
	let allow = true;
	const { p } = pool({ onCreated: (w, name) => created.push(`${name}#${(w as unknown as { threadId: number }).threadId}`), restarted: name => { asked.push(name); return allow; } });
	const a = await p.workerFor({ label: 'mcp', pid: 4300 });
	const u = await p.workerFor();
	const s1 = await p.sharedWorker();
	assert.deepEqual(created, [`session mcp:4300#${a.threadId}`, `unattributed#${u.threadId}`, `shared-state#${s1.threadId}`], 'each worker, as it is created');
	assert.deepEqual(asked, [], "a first start is not a restart");

	// The shared-state worker exits on its own: its next start is a restart, asked first.
	const sharedWorker = (p as unknown as { entries: Map<string, { started: { worker: EventEmitter } }> }).entries.get('session:shared')!.started.worker;
	sharedWorker.emit('exit', 1);
	const s2 = await p.sharedWorker();
	assert.notEqual(s2.threadId, s1.threadId);
	assert.deepEqual(asked, ['shared-state'], 'the restart was counted');
	const again = (p as unknown as { entries: Map<string, { started: { worker: EventEmitter } }> }).entries.get('session:shared')!.started.worker;
	allow = false;
	again.emit('exit', 1);
	await assert.rejects(p.sharedWorker(), (err: unknown) => err instanceof SessionWorkerStartError && /the shared-state worker exceeded the restart limit/.test(err.message));
	// A session worker's exit is not counted: the next request just starts a new one, as in s3.
	const sessionWorker = (p as unknown as { entries: Map<string, { started: { worker: EventEmitter } }> }).entries.get('session:mcp:4300')!.started.worker;
	sessionWorker.emit('exit', 1);
	const a2 = await p.workerFor({ label: 'mcp', pid: 4300 });
	assert.notEqual(a2.threadId, a.threadId);
	assert.deepEqual(asked, ['shared-state', 'shared-state']);
});

test('session pool: a shared-state worker that fails to start counts like one that exited: its next start is a restart', async () => {
	const asked: string[] = [];
	let allow = true;
	const { p, workers } = pool({ restarted: name => { asked.push(name); return allow; } });
	workers.fail('a bad model-definitions file');
	await assert.rejects(p.sharedWorker(), SessionWorkerStartError);
	assert.deepEqual(asked, [], 'the first start is not a restart');
	await assert.rejects(p.sharedWorker(), SessionWorkerStartError);
	assert.deepEqual(asked, ['shared-state'], 'the start after a failed one is counted');
	allow = false;
	await assert.rejects(p.sharedWorker(), (err: unknown) => err instanceof SessionWorkerStartError && /exceeded the restart limit/.test(err.message), 'past the limit no worker is started');
	assert.equal(workers.starts.filter(n => n === 'shared-state').length, 2, 'the refused start spawned nothing');
	workers.fail(undefined);
	allow = true;
	await p.sharedWorker();
	const startsAfter = asked.length;
	await p.sharedWorker();
	assert.equal(asked.length, startsAfter, 'once running, asking for it again is not a restart');
});

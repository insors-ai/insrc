/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic 86197ac6, Story s4 / t6: acceptance over the real threaded daemon (spawned under a temp
 * HOME with daemon.threads.enabled and INSRC_TEST_HOOKS=1). ac1: routed requests leave the main
 * thread's handler runtime unbuilt; a connection-scoped request builds it and is answered. ac3:
 * SIGTERM and daemon.shutdown end with 'bye' and exit 0, the workers (session-pool workers
 * included) terminated before the stores close. t7: ac4 the threads list, ac5 liveness while a
 * session worker spins, ac6 field parity with a threads-disabled daemon.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/s4-acceptance.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createIpcClient } from '../../../shared/ipc-client.js';
import type { ThreadView } from '../../../shared/types.js';
import { Conn, once, spawnDaemon, stopDaemon, until } from './helpers/daemon-socket.js';
import type { SpawnedDaemon } from './helpers/daemon-socket.js';

const BUILT = 'handler runtime built on the main thread';
const CONFIG = { daemon: { threads: { enabled: true } } };
const homes: string[] = [];
const daemons: SpawnedDaemon[] = [];
const home = (): string => { const h = mkdtempSync(join(tmpdir(), 'insrc-s4-acceptance-')); homes.push(h); return h; };
after(async () => {
	for (const d of daemons) await stopDaemon(d);
	for (const h of homes) rmSync(h, { recursive: true, force: true });
});
const count = (text: string, line: string): number => text.split(line).length - 1;

test("s4 ac1: routed requests leave the main thread's handler runtime unbuilt; a connection-scoped request is answered and builds it", { timeout: 120_000 }, async () => {
	const d = await spawnDaemon(home(), CONFIG);
	daemons.push(d);
	const A = { label: 'mcp', pid: 9401 };
	// Admin, indexing and session requests: each served on its worker.
	for (const [method, params, client] of [
		['daemon.status', {}, undefined], ['repo.list', {}, undefined], ['daemon.debug-status', {}, undefined],
		['repo.stats', {}, undefined], ['test.servingThread', null, A], ['session.list', {}, A],
	] as const) {
		const r = await once(d.sock, method, params, client);
		assert.equal(r.error, undefined, `${method} answered: ${r.error ?? ''}`);
	}

	// A connection-management method stays on the main thread: it is answered there, and builds the runtime then.
	const conn = await once(d.sock, 'db.listDriverKinds', {});
	assert.equal(conn.error, undefined, `db.listDriverKinds answered: ${conn.error ?? ''}`);
	assert.equal((await once(d.sock, 'db.listDriverKinds', {})).error, undefined);
	// The build is logged with the method that caused it, and only once: had a routed request built it,
	// that request would be the one named (the log is written asynchronously, so its absence alone proves nothing).
	await until(() => count(d.stderr(), BUILT) >= 1, 'the build logged');
	await new Promise(r => setTimeout(r, 500));
	assert.equal(count(d.stderr(), BUILT), 1, 'built once; the later local request reused it');
	const after = d.stderr().slice(d.stderr().indexOf(BUILT));
	assert.match(after.slice(0, 300), /method: "db\.listDriverKinds"/, 'built by the connection-management request, not by any routed one');
});

test("s4 ac3: SIGTERM and daemon.shutdown exit 0 after 'bye' with every worker, session-pool workers included, terminated", { timeout: 180_000 }, async () => {
	for (const how of ['SIGTERM', 'daemon.shutdown'] as const) {
		const d = await spawnDaemon(home(), CONFIG);
		// Session-pool workers alive at the stop: two sessions and the unattributed worker, besides the shared-state one.
		assert.equal((await once(d.sock, 'test.servingThread', null, { label: 'mcp', pid: 9411 })).error, undefined);
		assert.equal((await once(d.sock, 'test.servingThread', null, { label: 'mcp', pid: 9412 })).error, undefined);
		assert.equal((await once(d.sock, 'test.servingThread', null)).error, undefined);
		let code: number | null;
		if (how === 'SIGTERM') code = await stopDaemon(d);
		else {
			assert.deepEqual((await once(d.sock, 'daemon.shutdown', {})).result, { ok: true });
			code = await d.exited;
		}
		const log = d.stderr();
		assert.equal(code, 0, `${how}: exit 0 (${log.slice(-1500)})`);
		const exited = log.indexOf("shutdown: the daemon's workers exited");
		const closed = log.indexOf('shutdown: stores closed');
		const bye = log.lastIndexOf('bye');
		assert.ok(exited >= 0 && closed > exited && bye > closed, `${how}: the workers exited, then the stores closed, then 'bye'`);
		assert.doesNotMatch(log, /supervisor: a worker failed|session pool: a session worker exited/, `${how}: no worker ended on its own`);
	}
});

/** The threads of a daemon.status answer. */
const threadsOf = async (sock: string): Promise<ThreadView[]> => ((await once(sock, 'daemon.status', {})).result as { threads?: ThreadView[] }).threads ?? [];

test('s4 ac4: daemon.status threads lists the admin, code-indexing, document-summary, shared-state and two session threads with role, class and session', { timeout: 120_000 }, async () => {
	const d = await spawnDaemon(home(), CONFIG);
	daemons.push(d);
	const A = { label: 'mcp', pid: 9421 };
	const B = { label: 'codex', pid: 9422 };
	const a = ((await once(d.sock, 'test.servingThread', null, A)).result as { threadId: number }).threadId;
	const b = ((await once(d.sock, 'test.servingThread', null, B)).result as { threadId: number }).threadId;
	await until(async () => (await threadsOf(d.sock)).some(t => t.role === 'shared-state') && (await threadsOf(d.sock)).some(t => t.role === 'document-summary'), 'the shared-state and document-summary threads listed');
	const threads = await threadsOf(d.sock);
	const byRole = (role: string) => threads.filter(t => t.role === role);
	assert.equal(byRole('admin').length, 1);
	assert.equal(byRole('admin')[0]!.cls, 'admin');
	assert.equal(byRole('code-indexing').length, 1);
	assert.equal(byRole('code-indexing')[0]!.cls, 'indexing');
	assert.equal(byRole('document-summary').length, 1);
	assert.equal(byRole('document-summary')[0]!.cls, undefined, 'the summary worker serves no request class');
	assert.equal(byRole('shared-state').length, 1);
	assert.equal(byRole('shared-state')[0]!.cls, 'session');
	const sessions = byRole('session');
	assert.deepEqual(sessions.find(t => t.threadId === a)?.session, A, "session A's thread, with its session");
	assert.deepEqual(sessions.find(t => t.threadId === b)?.session, B, "session B's thread, with its session");
	assert.equal(new Set(threads.map(t => t.threadId)).size, threads.length, 'each thread once');
	for (const t of threads) {
		assert.equal(typeof t.busy, 'boolean');
		assert.equal(typeof t.queued, 'number');
		assert.equal(typeof t.activeRuns, 'number');
	}
});

test('s4 ac5: with a session worker spinning, daemon.status answers within 100 ms at p99, shows it busy with growing elapsedMs, and reachability is running', { timeout: 120_000 }, async () => {
	const d = await spawnDaemon(home(), CONFIG);
	daemons.push(d);
	const A = { label: 'mcp', pid: 9431 };
	const spinner = ((await once(d.sock, 'test.servingThread', null, A)).result as { threadId: number }).threadId;
	const spinning = once(d.sock, 'test.spin', { ms: 12_000 }, A);
	await until(async () => (await threadsOf(d.sock)).find(t => t.threadId === spinner)?.busy === true, "A's worker busy");
	const c = await Conn.open(d.sock);
	const latencies: number[] = [];
	const elapsed: number[] = [];
	try {
		for (let i = 0; i < 100; i++) {
			const t0 = performance.now();
			const r = await c.ask('daemon.status', {});
			latencies.push(performance.now() - t0);
			assert.equal(r.error, undefined);
			const me = ((r.result as { threads?: ThreadView[] }).threads ?? []).find(t => t.threadId === spinner);
			assert.equal(me?.busy, true, 'the spinning session is reported busy');
			assert.equal(me?.method, 'test.spin');
			assert.deepEqual(me?.session, A);
			elapsed.push(me!.elapsedMs!);
			if (i % 10 === 9) await new Promise(r => setTimeout(r, 50));
		}
	} finally { c.close(); }
	const sorted = [...latencies].sort((x, y) => x - y);
	const p99 = sorted[Math.ceil(sorted.length * 0.99) - 1]!;
	assert.ok(p99 < 100, `p99 ${p99.toFixed(1)} ms over 100 calls while a session worker spun`);
	assert.ok(elapsed.every((e, i) => i === 0 || e >= elapsed[i - 1]!), 'elapsedMs never goes back');
	assert.ok(elapsed.at(-1)! > elapsed[0]! + 300, `elapsedMs grows (${elapsed[0]} -> ${elapsed.at(-1)})`);
	const ipc = createIpcClient(() => connect(d.sock));
	assert.equal(await ipc.reachability(), 'running', 'a client checking liveness finds the daemon running');
	assert.equal((await spinning).error, undefined, 'the spin finished on its worker');
});

test('s4 ac6: daemon.status and debug-status keep every field of a threads-disabled daemon with the same types; threads is the only addition', { timeout: 180_000 }, async () => {
	const threaded = await spawnDaemon(home(), CONFIG);
	daemons.push(threaded);
	const single = await spawnDaemon(home(), { daemon: { threads: { enabled: false } } });
	daemons.push(single);
	const client = { label: 'mcp', pid: 9441 };
	// The same traffic on both, so each has an attached client with a lastMethod.
	for (const d of [threaded, single]) assert.equal((await once(d.sock, 'session.list', {}, client)).error, undefined);
	await until(async () => (await threadsOf(threaded.sock)).length > 0, 'the threaded daemon lists its threads');
	const types = (o: Record<string, unknown>): Record<string, string> =>
		Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v]));
	for (const method of ['daemon.status', 'daemon.debug-status']) {
		const one = (await once(single.sock, method, {})).result as Record<string, unknown>;
		const many = (await once(threaded.sock, method, {})).result as Record<string, unknown>;
		assert.equal('threads' in one, false, `${method}: no threads without daemon threads`);
		assert.ok(Array.isArray(many['threads']) && (many['threads'] as unknown[]).length > 0, `${method}: threads with them`);
		const { threads: _threads, ...rest } = many;
		assert.deepEqual(types(rest), types(one), `${method}: the same fields with the same value types; threads is the only addition`);
	}
	// debug-status clients keep their shape, lastMethod included.
	const clientsOf = async (sock: string) => ((await once(sock, 'daemon.debug-status', {}, client)).result as { clients: Record<string, unknown>[] }).clients;
	const one = (await clientsOf(single.sock)).find(c => c['pid'] === client.pid)!;
	const many = (await clientsOf(threaded.sock)).find(c => c['pid'] === client.pid)!;
	assert.ok(one !== undefined && many !== undefined, 'the client is listed by both');
	assert.deepEqual(Object.keys(many).sort(), Object.keys(one).sort(), 'the same client fields');
	assert.equal(typeof many['lastMethod'], 'string', 'lastMethod is kept');
});

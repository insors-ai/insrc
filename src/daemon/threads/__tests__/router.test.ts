/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The router (Epic 86197ac6, Story s2, t9): routed classes go to their
 * registered worker and come back in today's wire shape; other requests run
 * on the main thread; a missing worker holds a request for a bounded time; a
 * socket close cancels a stream on its worker and drops a unary reply; the
 * attached clients are on the board before a request is forwarded.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/router.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, Worker, threadId as mainThreadId } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-router-'));
process.env['HOME'] = HOME;
const { IpcServer, directDispatch } = await import('../../server.js');
const { Router } = await import('../router.js');
const { ThreadServices } = await import('../main-services.js');
const { serveRequests } = await import('../worker-requests.js');
import type { MethodClass } from '../channel.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }));
const workers: Worker[] = [];
after(async () => {
	for (const w of workers) await w.terminate();
	rmSync(HOME, { recursive: true, force: true });
});

/** The test's method classes: the worker's test methods are admin; everything else is session. */
const CLASSES: Record<string, MethodClass> = { 'x.echo': 'admin', 'x.slow': 'admin', 's.wait': 'admin', 'daemon.debug-status': 'admin', 'repo.reindex': 'indexing' };
const classOf = (m: string): MethodClass | undefined => CLASSES[m] ?? 'session';

/** Start the test worker as the admin target; resolves with it and its messages to the test. */
async function startAdminWorker(router: InstanceType<typeof Router>): Promise<{ worker: Worker; messages: unknown[] }> {
	const conn = services.connectWorker();
	const worker = new Worker(join(HERE, 'helpers', 'request-worker.ts'), { workerData: conn.workerData, transferList: conn.transferList });
	workers.push(worker);
	const messages: unknown[] = [];
	await new Promise<void>(resolve => worker.on('message', m => { if (m === 'ready') resolve(); else messages.push(m); }));
	services.registry.register({ threadId: worker.threadId, cls: 'admin' });
	router.attach(worker.threadId, conn.port);
	return { worker, messages };
}

test('maintenance lock at the router: a target missing for 30 s answers the not-available error, and one registering within 30 s serves the held request', async () => {
	const registry = new (await import('../registry.js')).TargetRegistry();
	const router = new Router({ classOf, registry, routed: new Set(['admin', 'indexing']), local: directDispatch({}), holdMs: 150 });
	const replies: unknown[] = [];
	const deliver = (e: unknown): void => { replies.push(e); };

	// Nothing registered for indexing: answered after the hold.
	const started = Date.now();
	router.forward({ kind: 'request', requestId: 'r1', method: 'repo.reindex', params: {}, stream: false }, deliver);
	await new Promise(r => setTimeout(r, 300));
	assert.deepEqual(replies, [{ kind: 'reply', requestId: 'r1', error: "the daemon's indexing thread is not available" }]);
	assert.ok(Date.now() - started >= 150);

	// A target that registers during the hold serves the held request.
	replies.length = 0;
	router.forward({ kind: 'request', requestId: 'r2', method: 'x.echo', params: 'held', stream: false }, deliver);
	await new Promise(r => setTimeout(r, 50));
	assert.deepEqual(replies, [], 'still held');
	const { port1, port2 } = new MessageChannel();
	serveRequests(port2, directDispatch({ 'x.echo': async p => ({ echo: p }) }));
	registry.register({ threadId: 4242, cls: 'admin' });
	router.attach(4242, port1);
	await new Promise(r => setTimeout(r, 200));
	assert.deepEqual(replies, [{ kind: 'reply', requestId: 'r2', result: { echo: 'held' } }], 'served once the target registered, and not timed out');
	port1.close();
});

test('an admin or indexing request reaches its registered target and a session request runs on the main thread', async () => {
	const local = directDispatch({ 'x.where': async () => ({ threadId: mainThreadId }) });
	const router = new Router({ classOf, registry: services.registry, routed: new Set(['admin']), local });
	const { worker } = await startAdminWorker(router);
	const dir = mkdtempSync(join(tmpdir(), 'insrc-router-sock-'));
	const server = new IpcServer(router.forward, Date.now, join(dir, 'd.sock'));
	await server.listen();
	try {
		const ask = (line: object): Promise<unknown> => new Promise((resolve, reject) => {
			const s = connect(join(dir, 'd.sock'));
			let buf = '';
			s.on('data', c => { buf += c.toString(); const i = buf.indexOf('\n'); if (i >= 0) { s.end(); resolve(JSON.parse(buf.slice(0, i))); } });
			s.on('error', reject);
			s.on('connect', () => s.write(JSON.stringify(line) + '\n'));
		});
		assert.deepEqual(await ask({ id: 1, method: 'x.echo', params: 'p' }), { id: 1, result: { echo: 'p', threadId: worker.threadId } }, 'admin ran on the worker, in today\'s wire shape');
		assert.deepEqual(await ask({ id: 2, method: 'x.where' }), { id: 2, result: { threadId: mainThreadId } }, 'session ran on the main thread');
		assert.deepEqual(await ask({ id: 3, method: 'no.such' }), { id: 3, error: 'unknown method: no.such' });
	} finally {
		await server.close();
		rmSync(dir, { recursive: true, force: true });
		services.registry.unregister(worker.threadId);
		router.detach(worker.threadId);
	}
});

/** A fake Socket that records what is written to it and can be closed. */
class CapturingSocket extends EventEmitter {
	readonly writes: string[] = [];
	write(chunk: string, cb?: (err?: Error) => void): boolean { this.writes.push(chunk); cb?.(); return true; }
}
type Internals = { handleConnection(s: CapturingSocket): void; handleMessage(raw: string, s: CapturingSocket): Promise<void> };

test("a socket closed during a unary request on a worker: the handler completes (its side effect is visible) and no reply is written; during a stream request the stream's AbortSignal fires", async () => {
	const router = new Router({ classOf, registry: services.registry, routed: new Set(['admin']), local: directDispatch({}) });
	const { worker, messages } = await startAdminWorker(router);
	try {
		const server = new IpcServer(router.forward, () => 1000) as unknown as Internals;
		const sock = new CapturingSocket();
		server.handleConnection(sock);
		void server.handleMessage(JSON.stringify({ id: 1, method: 'x.slow' }), sock);
		void server.handleMessage(JSON.stringify({ id: 2, method: 's.wait', stream: true }), sock);
		const until = async (cond: () => boolean): Promise<void> => { for (let i = 0; i < 300 && !cond(); i++) await new Promise(r => setTimeout(r, 10)); };
		await until(() => sock.writes.length === 1);
		assert.deepEqual(JSON.parse(sock.writes[0]!), { id: 2, stream: 'progress', data: 'waiting' }, 'the stream started on the worker');
		sock.emit('close');
		await until(() => messages.length === 2);
		assert.deepEqual(messages.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))), [{ aborted: 's.wait' }, { sideEffect: 'x.slow' }],
			"the stream's AbortSignal fired on the worker, and the unary handler ran to completion");
		await new Promise(r => setTimeout(r, 50));
		assert.equal(sock.writes.length, 1, 'no reply was written after the close');
	} finally {
		services.registry.unregister(worker.threadId);
		router.detach(worker.threadId);
	}
});

test("debug-status called right after other requests reports each client's lastMethod exactly as today, including 'daemon.debug-status' for the caller itself", async () => {
	const router = new Router({ classOf, registry: services.registry, routed: new Set(['admin']), local: directDispatch({ 'repo.list': async () => [] }) });
	const { worker } = await startAdminWorker(router);
	try {
		const ipc = new IpcServer(router.forward, () => 1000);
		ipc.onRegistryChange(clients => services.board.publishClients(clients));
		const server = ipc as unknown as Internals;
		const other = new CapturingSocket();
		const caller = new CapturingSocket();
		server.handleConnection(other);
		server.handleConnection(caller);
		await server.handleMessage(JSON.stringify({ id: 1, method: 'repo.list', client: { label: 'cli', pid: 11 } }), other);
		await server.handleMessage(JSON.stringify({ id: 2, method: 'daemon.debug-status', client: { label: 'mcp', pid: 22 } }), caller);
		const reply = JSON.parse(caller.writes[0]!) as { id: number; result: { clients: { label: string; pid: number; lastMethod: string }[] } };
		assert.equal(reply.id, 2);
		assert.deepEqual(reply.result.clients.map(c => [c.label, c.pid, c.lastMethod]), [['cli', 11, 'repo.list'], ['mcp', 22, 'daemon.debug-status']],
			'answered on the admin worker from the board, the caller\'s own lastMethod included');
		assert.deepEqual(reply.result.clients, ipc.attachedClients(), 'equal to the server\'s own registry, as today');
	} finally {
		services.registry.unregister(worker.threadId);
		router.detach(worker.threadId);
	}
});

test('requests held for a class that stops being routed are served in this thread', async () => {
	const registry = new (await import('../registry.js')).TargetRegistry();
	const routed = new Set<MethodClass>(['admin']);
	const router = new Router({ classOf, registry, routed, local: directDispatch({ 'x.echo': async p => ({ local: p }) }), holdMs: 10_000 });
	const replies: unknown[] = [];
	router.forward({ kind: 'request', requestId: 'h1', method: 'x.echo', params: 1, stream: false }, e => { replies.push(e); });
	await new Promise(r => setTimeout(r, 20));
	assert.deepEqual(replies, [], 'held for the admin worker');
	routed.delete('admin');
	router.targetsChanged();
	await new Promise(r => setTimeout(r, 20));
	assert.deepEqual(replies, [{ kind: 'reply', requestId: 'h1', result: { local: 1 } }], 'served here at once, not after the hold');
});

test('a unary request cancelled while held for a worker ends its activity: the request-ended callback runs, so idle maintenance is not blocked for good', async () => {
	const registry = new (await import('../registry.js')).TargetRegistry();
	let inFlight = 0;
	const router = new Router({
		classOf, registry, routed: new Set(['admin']), local: directDispatch({}), holdMs: 10_000,
		onRequest: () => { inFlight++; let ended = false; return () => { if (!ended) { ended = true; inFlight--; } }; },
	});
	const replies: unknown[] = [];
	// No admin worker is registered: the request is held.
	const cancel = router.forward({ kind: 'request', requestId: 'held-1', method: 'x.echo', params: {}, stream: false }, e => replies.push(e));
	assert.equal(inFlight, 1);
	cancel();   // its socket closed while it was held
	assert.equal(inFlight, 0, 'the held request no longer counts as activity');
	assert.deepEqual(replies, [], 'no reply for a cancelled request');
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A store read that fails inside a request or a job is recorded where the
 * daemon catches it (Epic c2ba6fa6, Story s4, t5): the request server's three
 * catch sites and the queue's job runner. Reads have no wrapper in the store
 * layer, so these four places are where the library's raw error arrives.
 *
 * The first test injects that error into handlers, with NO real socket (the
 * connection listener is invoked directly, as in server-registry.test.ts). The
 * other two use a really broken store in a child process.
 *
 * Run: npx tsx --test src/daemon/__tests__/store-failure-dispatch.test.ts
 */

import { after, afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join } from 'node:path';

import { IpcServer, directDispatch, failureMessage } from '../server.js';
import { IndexQueue } from '../queue.js';
import { getStoreHealth, resetStoreHealthForTests } from '../../db/graph/store.js';
import { killAllStoreChildren, runLockLossSequence } from '../../db/graph/__tests__/helpers/store-child-driver.js';
import type { IndexJob, IpcRequest } from '../../shared/types.js';

// A short root: the child's request socket lives under it (path limit ~104 bytes).
const base = mkdtempSync('/tmp/insrc-dispatch-');
beforeEach(() => { resetStoreHealthForTests(); });
afterEach(() => { killAllStoreChildren(); });
after(() => {
	resetStoreHealthForTests();
	killAllStoreChildren();
	rmSync(base, { recursive: true, force: true });
});

/** What a store read throws once the locks are gone. */
function lockFailure(): Error {
	return Object.assign(new Error('MDB_LOCK_FAILURE: Failed to get robust semaphore, increase max semaphores (kern.sysv.semume)'), { code: -30775 });
}
function badRslot(): Error {
	return Object.assign(new Error('Invalid argument: MDB_BAD_RSLOT: Invalid reuse of reader locktable slot'), { code: 22 });
}

class FakeSocket extends EventEmitter {
	readonly written: Array<Record<string, unknown>> = [];
	write(data: string): boolean {
		for (const line of data.split('\n')) if (line.trim()) this.written.push(JSON.parse(line) as Record<string, unknown>);
		return true;
	}
	removeListener(event: string, fn: (...a: unknown[]) => void): this { return super.removeListener(event, fn); }
}

/** Deliver one request to the server and return what it wrote back. */
async function request(server: IpcServer, req: Partial<IpcRequest>): Promise<Record<string, unknown>> {
	const socket = new FakeSocket();
	(server as unknown as { handleConnection(s: unknown): void }).handleConnection(socket);
	socket.emit('data', Buffer.from(`${JSON.stringify({ id: 1, params: {}, ...req })}\n`));
	for (let i = 0; i < 50 && socket.written.length === 0; i++) await new Promise(r => setImmediate(r));
	assert.equal(socket.written.length, 1, 'one answer');
	return socket.written[0] as Record<string, unknown>;
}

function assertNamed(message: unknown, operation: string): void {
	assert.equal(typeof message, 'string');
	assert.match(message as string, /^LmdbStoreLocksLostError: /);
	assert.match(message as string, /removed by another process/);
	assert.ok((message as string).includes(operation), `names the operation (${operation})`);
	assert.doesNotMatch(message as string, /semume/);
}

function assertRecorded(operation: string): void {
	const h = getStoreHealth();
	assert.equal(h.state, 'locks-lost');
	assert.ok(h.state === 'locks-lost' && h.detectedBy === 'read' && h.operation === operation, `recorded for ${operation}`);
}

test('dispatcher: a handler throwing code -30775 records locks-lost and the caller gets the named error, at each of the three server sites and the queue runner', async () => {
	for (const thrown of [lockFailure, badRslot]) {
		const server = new IpcServer(
			directDispatch({ 'x.read': async () => { throw thrown(); } },
			{ 'x.stream': async () => { throw thrown(); } }),
		);

		// Site 1: the standard request.
		resetStoreHealthForTests();
		const std = await request(server, { method: 'x.read' });
		assertNamed(std['error'], 'request x.read');
		assertRecorded('request x.read');

		// Site 2: a stream request for a method that has only a standard handler.
		resetStoreHealthForTests();
		const fallback = await request(server, { method: 'x.read', stream: true });
		assertNamed(fallback['error'], 'request x.read');
		assertRecorded('request x.read');

		// Site 3: the stream handler.
		resetStoreHealthForTests();
		const stream = await request(server, { method: 'x.stream', stream: true });
		assert.equal(stream['stream'], 'error');
		assertNamed((stream['data'] as { error: unknown }).error, 'request x.stream');
		assertRecorded('request x.stream');

		// The queue's job runner.
		resetStoreHealthForTests();
		const queue = new IndexQueue();
		const job = { kind: 'full', repoPath: '/r' } as unknown as IndexJob;
		const drained = queue.start(async () => { queue.stop(); throw thrown(); });
		queue.enqueue(job);
		await drained;
		assertRecorded('job full');
	}

	// Any other error is passed through as before and records nothing.
	resetStoreHealthForTests();
	const server = new IpcServer(directDispatch({ 'x.read': async () => { throw Object.assign(new Error('Invalid argument'), { code: 22 }); } }));
	assert.deepEqual(await request(server, { method: 'x.read' }), { id: 1, error: 'Invalid argument' });
	assert.equal(failureMessage('plain', 'm'), 'plain');
	assert.deepEqual(getStoreHealth(), { state: 'ok' });
	const queue = new IndexQueue();
	const drained = queue.start(async () => { queue.stop(); throw new Error('boom'); });
	queue.enqueue({ kind: 'full', repoPath: '/r' } as unknown as IndexJob);
	await drained;
	assert.deepEqual(getStoreHealth(), { state: 'ok' });
});

function tempHome(name: string): { home: string; store: string } {
	const home = join(base, name);
	mkdirSync(join(home, '.insrc'), { recursive: true });
	return { home, store: join(home, 'graph.lmdb') };
}

/** One request over a real socket; resolves with the first line answered.
 *  Never waits for ever: a connection that ends without an answer (the child
 *  died) and a silent one both reject. */
function ask(sock: string, req: Record<string, unknown>): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const c = createConnection(sock);
		let buf = '';
		const timer = setTimeout(() => { c.destroy(); reject(new Error(`no answer to ${String(req['method'])} within 10 s`)); }, 10_000);
		c.on('connect', () => c.write(`${JSON.stringify(req)}\n`));
		c.on('data', d => {
			buf += String(d);
			const nl = buf.indexOf('\n');
			if (nl < 0) return;
			clearTimeout(timer);
			c.end();
			resolve(JSON.parse(buf.slice(0, nl)) as Record<string, unknown>);
		});
		c.on('close', () => { clearTimeout(timer); reject(new Error(`connection closed without an answer to ${String(req['method'])}`)); });
		c.on('error', e => { clearTimeout(timer); reject(e); });
	});
}

const skip = process.platform === 'win32';

test('detection through the real wrappers: a read through the dispatcher records at once', { skip }, async () => {
	for (const [i, req] of [
		{ id: 7, method: 'test.read', params: {} },
		{ id: 8, method: 'test.read', params: {}, stream: true },
		{ id: 9, method: 'test.stream', params: {}, stream: true },
	].entries()) {
		const { home, store } = tempHome(`read-${i}`);
		const a = await runLockLossSequence(store, { env: { HOME: home } });
		const served = await a.send({ op: 'serve' });
		assert.ok(served.ok, served.ok ? '' : served.message);
		assert.deepEqual(await a.send({ op: 'health' }), { ok: true, value: { state: 'ok' } });

		const started = Date.now();
		const answer = await ask(served.value as string, req);
		assert.ok(Date.now() - started < 2_000, 'answered at once');
		const message = req.method === 'test.stream' ? (answer['data'] as { error: unknown }).error : answer['error'];
		assertNamed(message, `request ${req.method}`);

		const health = await a.send({ op: 'health' });
		assert.ok(health.ok);
		const h = health.value as { state: string; detectedBy: string; operation: string; libraryMessage: string };
		assert.equal(h.state, 'locks-lost');
		assert.equal(h.detectedBy, 'read');
		assert.equal(h.operation, `request ${req.method}`);
		assert.match(h.libraryMessage, /MDB_BAD_RSLOT/, 'the raw error of a process that had read before');
		await a.kill();
	}
});

test('periodic check records locks-lost when no request or write has met the failure', { skip }, async () => {
	const { home, store } = tempHome('periodic');
	const a = await runLockLossSequence(store, { env: { HOME: home } });
	assert.deepEqual(await a.send({ op: 'health' }), { ok: true, value: { state: 'ok' } }, 'nothing has met the failure yet');

	await a.send({ op: 'reader-check-every', ms: 200 });
	let h: { state: string; detectedBy?: string; operation?: string } = { state: 'ok' };
	for (let i = 0; i < 30 && h.state === 'ok'; i++) {
		await new Promise(r => setTimeout(r, 100));
		const r = await a.send({ op: 'health' });
		assert.ok(r.ok);
		h = r.value as typeof h;
	}
	assert.equal(h.state, 'locks-lost');
	assert.equal(h.detectedBy, 'read');
	assert.equal(h.operation, 'the reader check (periodic)');
	await a.kill();

	// Control: on a store that was not broken the same timer records nothing.
	const c = tempHome('periodic-healthy');
	const b = await runLockLossSequence(c.store, { touchLockFile: false, env: { HOME: c.home } });
	await b.send({ op: 'reader-check-every', ms: 100 });
	await new Promise(r => setTimeout(r, 600));
	assert.deepEqual(await b.send({ op: 'health' }), { ok: true, value: { state: 'ok' } });
	await b.kill();
});

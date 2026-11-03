/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic 86197ac6, Story s3 / t4: the session purge reaches the chat pool and the todos bus on
 * the thread that holds them. With daemon threads its two calls into those families are
 * nested in-daemon calls sent to the shared-state worker; without them it calls them in
 * process as before. chat.dropSession is served to in-daemon calls only.
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, Worker } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-purge-shared-'));
process.env['HOME'] = HOME;

const { getDb, initDb } = await import('../../../db/client.js');
const { saveSession } = await import('../../../db/conversations.js');
const { closeGraphStore, declareLiveStoreOwner } = await import('../../../db/graph/store.js');
const { closeLanceConn } = await import('../../../db/lance/conn.js');
const { buildHandlerRuntime } = await import('../../handler-runtime.js');
const { IpcServer, directDispatch } = await import('../../server.js');
const { createInDaemonClient } = await import('../../steps/daemon-client.js');
const { inDaemonTarget, methodClasses } = await import('../method-class.js');
const { Router } = await import('../router.js');
const { TargetRegistry } = await import('../registry.js');
import type { MethodClass } from '../channel.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = '/repos/purge-fixture';

before(async () => {
	declareLiveStoreOwner();
	await initDb(await getDb());
});
after(async () => {
	await closeLanceConn();
	await closeGraphStore();
	rmSync(HOME, { recursive: true, force: true });
});

async function runtime(nestedCall?: (method: string, params: unknown) => Promise<unknown>): Promise<ReturnType<typeof buildHandlerRuntime>> {
	const none = {} as never;
	return buildHandlerRuntime({
		db: await getDb(), configStore: none, queue: none, indexer: none, startedAt: 0,
		shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
		...(nestedCall !== undefined ? { nestedCall } : {}),
	});
}

test('purge: session.delete on a session worker drops the chat from the shared-state pool and its todos cleanup events reach an open todos.subscribe', async () => {
	await saveSession(await getDb(), { id: 'sess-threads', repo: REPO, summary: 'purged with threads' });
	const registry = new TargetRegistry();
	const routed = new Set<MethodClass>(['session']);
	const router = new Router({ classOf: methodClasses.classOf, registry, routed, local: directDispatch({}) });
	const { port1, port2 } = new MessageChannel();
	const worker = new Worker(join(HERE, 'helpers', 'shared-fake-worker.ts'), { workerData: { port: port2 }, transferList: [port2] });
	const calls: { method: string; params: unknown; threadId: number }[] = [];
	worker.on('message', m => { if (typeof m === 'object' && m !== null && 'method' in m) calls.push(m as typeof calls[number]); });
	try {
		await once(worker, 'message');   // worker-ready
		registry.register({ threadId: worker.threadId, cls: 'session', shared: true });
		router.attach(worker.threadId, port1);
		// A client of the shared-state worker keeps todos.subscribe open (sent on its channel directly).
		const frames: { stream: string; data: unknown }[] = [];
		port1.on('message', (m: { kind?: string; requestId?: string; frame?: { stream: string; data: unknown } }) => {
			if (m.kind === 'frame' && m.requestId === 'sub-1' && m.frame !== undefined) frames.push(m.frame);
		});
		port1.postMessage({ kind: 'request', requestId: 'sub-1', method: 'todos.subscribe', params: {}, stream: true });
		for (const deadline = Date.now() + 5_000; frames.length === 0;) { assert.ok(Date.now() < deadline, 'subscribed'); await new Promise(r => setTimeout(r, 10)); }

		// This thread plays a session worker: the in-daemon client and the purge's nested calls, as a worker wires them.
		let inDaemon: ReturnType<typeof createInDaemonClient> | undefined;
		const rt = await runtime((method, params) => inDaemon!.request(method, params));
		inDaemon = createInDaemonClient(rt.rpcHandlers, rt.streamHandlers, {
			route: { targetOf: m => inDaemonTarget(m, { routed, onSharedWorker: false }), request: (cls, method, params, opts) => router.request(cls, method, params, opts) },
		});
		const result = await rt.rpcHandlers['session.delete']!({ sessionId: 'sess-threads' }) as { deleted: boolean; counts: { sessionRows: number; todosListsDeleted: number; todosItemsDeleted: number } };

		assert.equal(result.deleted, true);
		assert.deepEqual(calls.map(c => c.method), ['chat.dropSession', 'todos.cleanup'], 'both reached the shared-state worker, in purge order');
		assert.ok(calls.every(c => c.threadId === worker.threadId));
		assert.deepEqual(calls[0]!.params, { sessionId: 'sess-threads' });
		assert.deepEqual(calls[1]!.params, { caller: 'system', sessionIds: ['sess-threads'] });
		assert.equal(result.counts.todosListsDeleted, 2, 'the shared-state worker\'s cleanup counts are the purge\'s');
		assert.equal(result.counts.todosItemsDeleted, 5);
		assert.equal(result.counts.sessionRows, 1);
		for (const deadline = Date.now() + 5_000; !frames.some(f => (f.data as { kind?: string } | null)?.kind === 'cleanup');) {
			assert.ok(Date.now() < deadline, 'the cleanup event reached the open subscription');
			await new Promise(r => setTimeout(r, 10));
		}
		assert.deepEqual(frames.find(f => (f.data as { kind?: string }).kind === 'cleanup')!.data, { kind: 'cleanup', sessionIds: ['sess-threads'] });
	} finally {
		port1.postMessage({ kind: 'cancel', requestId: 'sub-1' });
		router.detach(worker.threadId);
		port1.close();
		await worker.terminate();
	}
});

test('purge: chat.dropSession over the socket answers unknown method; threads off purges as today', async () => {
	const db = await getDb();
	const off = await runtime();
	// Over the socket: chat.dropSession is not a served method.
	const dir = mkdtempSync(join(tmpdir(), 'insrc-purge-sock-'));
	const server = new IpcServer(directDispatch(off.rpcHandlers, off.streamHandlers), Date.now, join(dir, 's.sock'));
	await server.listen();
	try {
		const socket = connect(join(dir, 's.sock'));
		await once(socket, 'connect');
		socket.write(JSON.stringify({ id: 1, method: 'chat.dropSession', params: { sessionId: 'x' } }) + '\n');
		const [chunk] = await once(socket, 'data') as [Buffer];
		assert.deepEqual(JSON.parse(chunk.toString().split('\n')[0]!), { id: 1, error: 'unknown method: chat.dropSession' });
		socket.destroy();
	} finally {
		await server.close();
		rmSync(dir, { recursive: true, force: true });
	}
	// Threads off (no nested call): the purge runs in process and gives the same counts as with the nested calls.
	await saveSession(db, { id: 'sess-off', repo: REPO, summary: 'purged in process' });
	const inProcess = await off.rpcHandlers['session.delete']!({ sessionId: 'sess-off' }) as { deleted: boolean; counts: Record<string, number> };
	await saveSession(db, { id: 'sess-nested', repo: REPO, summary: 'purged through nested calls' });
	const nestedCalls: string[] = [];
	const withNested = await runtime(async (method, params) => {
		nestedCalls.push(method);
		// Answered as the shared-state worker would, here in process.
		const inline = await runtime();
		const { inDaemonOnlyHandlers } = await import('../../handler-runtime.js');
		const table = { ...inline.rpcHandlers, ...inDaemonOnlyHandlers() };
		return table[method]!(params);
	});
	const nested = await withNested.rpcHandlers['session.delete']!({ sessionId: 'sess-nested' }) as { deleted: boolean; counts: Record<string, number> };
	assert.equal(inProcess.deleted, true);
	assert.deepEqual(nestedCalls, ['chat.dropSession', 'todos.cleanup']);
	const comparable = (c: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'durationMs'));
	assert.deepEqual(comparable(nested.counts), comparable(inProcess.counts), 'the same counts either way');
	assert.equal(inProcess.counts['sessionRows'], 1);
});

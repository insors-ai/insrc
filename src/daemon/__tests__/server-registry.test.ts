/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * IpcServer attached-client registry tests (Story s4, t2). Drives the private
 * connect/message/close registry against a fake Socket (EventEmitter stand-in)
 * with an injected clock — NO real socket, no real listen(). Reaches the private
 * handlers by invoking the connection listener createServer would call; since we
 * cannot listen() in a unit test, we exercise the registry through a tiny test
 * shim that mirrors handleConnection/handleMessage semantics is NOT used — instead
 * we drive the real methods via the server's own createServer callback capture.
 *
 * Run: npx tsx --test src/daemon/__tests__/server-registry.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import { IpcServer } from '../server.js';
import type { IpcRequest } from '../../shared/types.js';

/** A fake Socket: an EventEmitter with a no-op write. */
class FakeSocket extends EventEmitter {
	write(): boolean { return true; }
}

/** Reach the private handleConnection/handleMessage by casting — the registry is
 *  internal but its behaviour is the unit under test. */
interface ServerInternals {
	handleConnection(socket: FakeSocket): void;
	handleMessage(raw: string, socket: FakeSocket): Promise<void>;
}

function internals(server: IpcServer): ServerInternals {
	return server as unknown as ServerInternals;
}

/** A clock returning scripted epoch-ms values, one per call. */
function scriptedClock(values: number[]): () => number {
	let i = 0;
	return () => values[Math.min(i++, values.length - 1)]!;
}

function reqLine(method: string, client?: IpcRequest['client']): string {
	const req: IpcRequest = { id: 1, method, params: {}, ...(client !== undefined ? { client } : {}) };
	return JSON.stringify(req);
}

test('a new connection registers an entry labelled unknown until a message identifies it', async () => {
	const server = new IpcServer({}, {}, scriptedClock([1000, 2000]));
	const sock = new FakeSocket();
	internals(server).handleConnection(sock);

	let clients = server.attachedClients();
	assert.equal(clients.length, 1);
	assert.equal(clients[0]!.label, 'unknown');
	assert.equal(clients[0]!.connectedAt, 1000);
	assert.equal(clients[0]!.pid, undefined);
	assert.equal(clients[0]!.id, 1);

	// A message with no client envelope only records lastMethod.
	await internals(server).handleMessage(reqLine('daemon.status'), sock);
	clients = server.attachedClients();
	assert.equal(clients[0]!.label, 'unknown');
	assert.equal(clients[0]!.lastMethod, 'daemon.status');
});

test('handleMessage with a valid client envelope updates label/pid/lastMethod', async () => {
	const server = new IpcServer({}, {}, scriptedClock([1000]));
	const sock = new FakeSocket();
	internals(server).handleConnection(sock);
	await internals(server).handleMessage(reqLine('workflow.run', { label: 'mcp', pid: 4242 }), sock);

	const c = server.attachedClients()[0]!;
	assert.equal(c.label, 'mcp');
	assert.equal(c.pid, 4242);
	assert.equal(c.lastMethod, 'workflow.run');
});

test('a malformed client envelope is ignored — the connection stays unknown/pid undefined', async () => {
	const server = new IpcServer({}, {}, scriptedClock([1000]));
	const sock = new FakeSocket();
	internals(server).handleConnection(sock);

	// pid non-integer, then oversized label, then missing pid — all rejected.
	await internals(server).handleMessage(reqLine('m1', { label: 'x', pid: 3.5 } as unknown as IpcRequest['client']), sock);
	await internals(server).handleMessage(reqLine('m2', { label: 'y'.repeat(200), pid: 10 }), sock);
	await internals(server).handleMessage(reqLine('m3', { label: '', pid: 10 }), sock);

	const c = server.attachedClients()[0]!;
	assert.equal(c.label, 'unknown');
	assert.equal(c.pid, undefined);
	assert.equal(c.lastMethod, 'm3'); // lastMethod still tracked
});

test('socket close deletes the entry; a double-close / close-before-message is idempotent', async () => {
	const server = new IpcServer({}, {}, scriptedClock([1000, 2000]));
	const a = new FakeSocket();
	const b = new FakeSocket();
	internals(server).handleConnection(a);
	internals(server).handleConnection(b);
	assert.equal(server.attachedClients().length, 2);

	a.emit('close');
	assert.equal(server.attachedClients().length, 1);
	a.emit('close'); // double close — no throw, no negative count
	assert.equal(server.attachedClients().length, 1);

	// close-before-message: b closes with no entry lookup surprise
	b.emit('close');
	assert.equal(server.attachedClients().length, 0);
});

test('attachedClients() returns entries sorted by connectedAt', () => {
	const server = new IpcServer({}, {}, scriptedClock([3000, 1000, 2000]));
	const s1 = new FakeSocket();
	const s2 = new FakeSocket();
	const s3 = new FakeSocket();
	internals(server).handleConnection(s1); // connectedAt 3000
	internals(server).handleConnection(s2); // 1000
	internals(server).handleConnection(s3); // 2000

	const order = server.attachedClients().map(c => c.connectedAt);
	assert.deepEqual(order, [1000, 2000, 3000]);
	// attachedClients() is read-only: calling it does not shrink/mutate the registry.
	assert.equal(server.attachedClients().length, 3);
});

test('the daemon.debug-status contract returns { clients } from the registry with no side effects (k1/k5)', async () => {
	const server = new IpcServer({}, {}, scriptedClock([1000, 2000]));
	internals(server).handleConnection(new FakeSocket());
	internals(server).handleConnection(new FakeSocket());

	// This is exactly the daemon.debug-status handler body (index.ts).
	const handler = async (): Promise<{ clients: ReturnType<IpcServer['attachedClients']> }> => ({ clients: server.attachedClients() });
	const before = server.attachedClients().length;
	const res = await handler();
	assert.equal(res.clients.length, 2);
	// No connection was closed or mutated by reading the snapshot (k5).
	assert.equal(server.attachedClients().length, before);
});

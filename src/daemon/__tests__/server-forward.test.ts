/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The IpcServer forward seam (Epic 86197ac6, Story s2, t3): the server hands
 * each request to a forward function; directDispatch serves it in-thread with
 * today's rules, so the wire is unchanged. A socket close cancels a stream and
 * drops a unary reply; the registry hook fires before a request is forwarded.
 *
 * Run: npx tsx --test src/daemon/__tests__/server-forward.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { IpcServer, directDispatch } from '../server.js';
import type { ForwardRequest, RpcHandlers, StreamHandlers } from '../server.js';
import type { AttachedClient } from '../../shared/types.js';

/** Send raw lines over a real socket and collect the reply lines until `done` says enough. */
async function exchange(sockPath: string, lines: string[], done: (got: string[]) => boolean): Promise<string[]> {
	const socket = connect(sockPath);
	const got: string[] = [];
	let buf = '';
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => { socket.destroy(); reject(new Error(`timed out; got ${JSON.stringify(got)}`)); }, 5_000);
		socket.on('data', chunk => {
			buf += chunk.toString();
			const parts = buf.split('\n');
			buf = parts.pop() ?? '';
			got.push(...parts.filter(Boolean));
			if (done(got)) { clearTimeout(timer); socket.end(); resolve(got); }
		});
		socket.on('error', reject);
		socket.on('connect', () => { for (const l of lines) socket.write(l + '\n'); });
	});
}

test('new IpcServer(directDispatch(rpc, stream)) is wire-identical to today, including unknown method, invalid JSON, stream framing and the stream-to-unary fallback', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-server-forward-'));
	const rpc: RpcHandlers = {
		'x.ok': async (params) => ({ echo: params }),
		'x.undefined': async () => undefined,
		'x.fail': async () => { throw new Error('it failed'); },
		'x.syncThrow': (() => { throw new Error('thrown at once'); }) as RpcHandlers[string],
	};
	const stream: StreamHandlers = {
		's.count': async (_params, send) => {
			send({ id: 0, stream: 'progress', data: { n: 1 } });
			send({ id: 99, stream: 'progress', data: { n: 2 } });
			send({ id: 0, stream: 'done', data: { total: 2 } });
		},
		's.fail': async (_params, send) => { send({ id: 0, stream: 'progress', data: {} }); throw new Error('stream broke'); },
	};
	const server = new IpcServer(directDispatch(rpc, stream), Date.now, join(dir, 'd.sock'));
	await server.listen();
	try {
		const ask = async (line: string, n = 1): Promise<unknown[]> =>
			(await exchange(join(dir, 'd.sock'), [line], got => got.length >= n)).map(l => JSON.parse(l) as unknown);

		assert.deepEqual(await ask(JSON.stringify({ id: 1, method: 'x.ok', params: { a: 1 } })), [{ id: 1, result: { echo: { a: 1 } } }]);
		assert.deepEqual(await ask(JSON.stringify({ id: 2, method: 'x.undefined' })), [{ id: 2 }], 'an undefined result has no result key, as today');
		assert.deepEqual(await ask(JSON.stringify({ id: 3, method: 'x.fail' })), [{ id: 3, error: 'it failed' }]);
		assert.deepEqual(await ask(JSON.stringify({ id: 4, method: 'x.syncThrow' })), [{ id: 4, error: 'thrown at once' }]);
		assert.deepEqual(await ask(JSON.stringify({ id: 5, method: 'nope' })), [{ id: 5, error: 'unknown method: nope' }]);
		assert.deepEqual(await ask('{not json'), [{ id: -1, error: 'invalid JSON' }]);
		// Stream framing: every frame carries the request's id, whatever the handler wrote.
		assert.deepEqual(await ask(JSON.stringify({ id: 6, method: 's.count', stream: true }), 3), [
			{ id: 6, stream: 'progress', data: { n: 1 } },
			{ id: 6, stream: 'progress', data: { n: 2 } },
			{ id: 6, stream: 'done', data: { total: 2 } },
		]);
		// A stream handler that throws ends with an error frame.
		assert.deepEqual(await ask(JSON.stringify({ id: 7, method: 's.fail', stream: true }), 2), [
			{ id: 7, stream: 'progress', data: {} },
			{ id: 7, stream: 'error', data: { error: 'stream broke', recoverable: true } },
		]);
		// A stream request for a unary-only method gets the unary handler's one reply.
		assert.deepEqual(await ask(JSON.stringify({ id: 8, method: 'x.ok', params: 'p', stream: true })), [{ id: 8, result: { echo: 'p' } }]);
		assert.deepEqual(await ask(JSON.stringify({ id: 9, method: 'nope', stream: true })), [{ id: 9, error: 'unknown method: nope' }]);
		// Several requests on one connection are answered independently.
		const both = (await exchange(join(dir, 'd.sock'), [
			JSON.stringify({ id: 10, method: 'x.ok', params: 1 }), JSON.stringify({ id: 11, method: 'x.fail' }),
		], got => got.length >= 2)).map(l => JSON.parse(l) as unknown);
		assert.deepEqual(both.sort((a, b) => (a as { id: number }).id - (b as { id: number }).id), [{ id: 10, result: { echo: 1 } }, { id: 11, error: 'it failed' }]);
	} finally {
		await server.close();
		rmSync(dir, { recursive: true, force: true });
	}
});

/** A fake Socket that records every line written to it and can be closed. */
class CapturingSocket extends EventEmitter {
	readonly writes: string[] = [];
	write(chunk: string, cb?: (err?: Error) => void): boolean { this.writes.push(chunk); cb?.(); return true; }
	close(): void { this.emit('close'); }
}
interface ServerInternals {
	handleConnection(socket: CapturingSocket): void;
	handleMessage(raw: string, socket: CapturingSocket): Promise<void>;
}
const internals = (server: IpcServer): ServerInternals => server as unknown as ServerInternals;

test('closing the socket aborts a stream request and drops a unary request\'s late reply while its handler completes', async () => {
	let finishUnary!: () => void;
	let sideEffect = false;
	let streamSignal: AbortSignal | undefined;
	const rpc: RpcHandlers = {
		'x.slow': async () => { await new Promise<void>(r => { finishUnary = r; }); sideEffect = true; return 'late'; },
	};
	const stream: StreamHandlers = {
		's.wait': async (_params, _send, signal) => { streamSignal = signal; await new Promise<void>(r => signal.addEventListener('abort', () => r())); },
	};
	const server = new IpcServer(directDispatch(rpc, stream), () => 1000);
	const sock = new CapturingSocket();
	internals(server).handleConnection(sock);
	const unary = internals(server).handleMessage(JSON.stringify({ id: 1, method: 'x.slow' }), sock);
	const streaming = internals(server).handleMessage(JSON.stringify({ id: 2, method: 's.wait', stream: true }), sock);
	await new Promise(r => setImmediate(r));
	assert.equal(streamSignal?.aborted, false);

	sock.close();
	assert.equal(streamSignal?.aborted, true, 'the stream handler\'s AbortSignal fired on close');
	await streaming;
	finishUnary();
	await unary;
	await new Promise(r => setImmediate(r));
	assert.equal(sideEffect, true, 'the unary handler ran to completion');
	assert.deepEqual(sock.writes, [], 'nothing was written after the close');
	assert.equal(await server.flushPendingWrites(10), true, 'no write failed');
});

test('the registry hook fires on connect, close and each message before the request is forwarded', async () => {
	const events: string[] = [];
	const view = (clients: AttachedClient[]): string => clients.map(c => `${c.label}:${c.lastMethod ?? '-'}`).join(',');
	const forward: ForwardRequest = (request, deliver) => {
		events.push(`forward ${request.method} session=${request.session?.label ?? 'none'}/${request.session?.pid ?? '-'}`);
		deliver({ kind: 'reply', requestId: request.requestId, result: null });
		return () => {};
	};
	const server = new IpcServer(forward, () => 1000);
	server.onRegistryChange(clients => events.push(`registry [${view(clients)}]`));
	const sock = new CapturingSocket();
	internals(server).handleConnection(sock);
	await internals(server).handleMessage(JSON.stringify({ id: 1, method: 'daemon.debug-status', client: { label: 'mcp', pid: 42 } }), sock);
	await internals(server).handleMessage(JSON.stringify({ id: 2, method: 'repo.list', client: { label: '', pid: 0 } }), sock);
	sock.close();
	assert.deepEqual(events, [
		'registry [unknown:-]',
		'registry [mcp:daemon.debug-status]',
		'forward daemon.debug-status session=mcp/42',
		'registry [mcp:repo.list]',
		'forward repo.list session=none/-',
		'registry []',
	]);
	assert.deepEqual(sock.writes.map(w => JSON.parse(w) as unknown), [{ id: 1, result: null }, { id: 2, result: null }]);
});

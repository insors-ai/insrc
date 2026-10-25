/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s3/t8: IpcClient.stream against the real unix-socket IpcServer.
 * Run: npx tsx --test src/shared/__tests__/ipc-client-stream.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { IpcServer, directDispatch } from '../../daemon/server.js';
import { createIpcClient, type IpcClient } from '../ipc-client.js';
import type { IpcStreamMessage } from '../types.js';

async function withServer(
	handler: (params: unknown, send: (m: IpcStreamMessage) => void, signal: AbortSignal) => Promise<void>,
	fn: (client: IpcClient) => Promise<void>,
): Promise<void> {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-ipc-stream-'));
	const path = join(dir, 'd.sock');
	const server = new IpcServer(directDispatch({}, { 'test.stream': handler }), Date.now, path);
	await server.listen();
	try { await fn(createIpcClient(() => createConnection(path))); } finally { await server.close(); rmSync(dir, { recursive: true, force: true }); }
}
const until = async (cond: () => boolean, ms = 3000): Promise<void> => {
	const end = Date.now() + ms;
	while (!cond()) { if (Date.now() > end) throw new Error('condition not met in time'); await new Promise(r => setTimeout(r, 10)); }
};

test('ipc-client-stream.test.ts: a client opens a stream, receives the pushed frames and closes it', async () => {
	let push: ((m: IpcStreamMessage) => void) | undefined;
	let started = false;
	await withServer(
		(_p, send, signal) => { push = send; started = true; return new Promise<void>(r => signal.addEventListener('abort', () => r(), { once: true })); },
		async client => {
			assert.equal(typeof client.stream, 'function');
			const frames: IpcStreamMessage[] = [];
			let closed = 0;
			const handle = client.stream!('test.stream', { a: 1 }, f => frames.push(f), () => { closed += 1; });
			await until(() => started);
			push!({ id: 0, stream: 'gate', data: { n: 1 } });
			push!({ id: 0, stream: 'gate', data: { n: 2 } });
			await until(() => frames.length === 2);
			assert.deepEqual(frames.map(f => f.data), [{ n: 1 }, { n: 2 }]);
			assert.equal(frames[0]!.stream, 'gate');
			handle.close();
			assert.equal(closed, 1, 'onClose ran once');
			handle.close(); // closing twice is harmless
			assert.equal(closed, 1);
		},
	);
});

test("ipc-client-stream.test.ts: closing the handle aborts the server's stream handler", async () => {
	let aborted = false; let started = false;
	await withServer(
		(_p, _send, signal) => { started = true; return new Promise<void>(r => signal.addEventListener('abort', () => { aborted = true; r(); }, { once: true })); },
		async client => {
			const handle = client.stream!('test.stream', {}, () => {});
			await until(() => started);
			assert.equal(aborted, false);
			handle.close();
			await until(() => aborted);
		},
	);
	// A stream to a daemon that is not there ends with an error through onClose.
	const gone = createIpcClient(() => createConnection('/tmp/insrc-no-such-daemon.sock'));
	const err = await new Promise<Error | undefined>(resolve => { gone.stream!('test.stream', {}, () => {}, e => resolve(e)); });
	assert.match(err?.message ?? '', /daemon is not running/);
});

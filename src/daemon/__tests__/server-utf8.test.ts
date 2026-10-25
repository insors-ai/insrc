import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConnection } from 'node:net';
import { IpcServer, directDispatch } from '../server.js';

test('daemon request reader preserves UTF-8 split inside a multibyte request parameter', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-server-utf8-')), path = join(dir, 'd.sock');
	const server = new IpcServer(directDispatch({ echo: async params => params }), Date.now, path);
	await server.listen();
	const socket = createConnection(path);
	try {
		const response = new Promise<unknown>((resolve, reject) => {
			const chunks: Buffer[] = [];
			socket.on('data', (chunk: Buffer) => { chunks.push(chunk); const text = Buffer.concat(chunks).toString(); if (text.includes('\n')) resolve(JSON.parse(text)); });
			socket.on('error', reject);
		});
		await new Promise<void>(r => socket.on('connect', r));
		const request = Buffer.from(JSON.stringify({ id: 1, method: 'echo', params: { text: '—é🙂' } }) + '\n');
		const split = request.indexOf(Buffer.from('—')) + 1;
		socket.write(request.subarray(0, split));
		await new Promise(r => setTimeout(r, 20));
		socket.write(request.subarray(split));
		assert.deepEqual(await response, { id: 1, result: { text: '—é🙂' } });
	} finally { socket.destroy(); await server.close(); rmSync(dir, { recursive: true, force: true }); }
});

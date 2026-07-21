/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';

import { runWorkflowStream } from '../daemon-stream.js';

/** A tiny in-process daemon that speaks the frame protocol on a temp socket. */
function fakeDaemon(onRequest: (req: unknown, socket: Socket) => void): { path: string; server: Server; close: () => Promise<void> } {
	const path = join(tmpdir(), `insrc-ds-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sock`);
	try { rmSync(path); } catch { /* ignore */ }
	const server = createServer((socket: Socket) => {
		let buffer = '';
		socket.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.trim()) continue;
				onRequest(JSON.parse(line), socket);
			}
		});
		socket.on('error', () => { /* client vanished */ });
	});
	return {
		path,
		server,
		close: () => new Promise<void>((res) => { server.close(() => { try { rmSync(path); } catch { /* ignore */ } res(); }); }),
	};
}

function listen(server: Server, path: string): Promise<void> {
	return new Promise((res) => server.listen(path, () => res()));
}

/** Write `s` in two chunks split mid-way — exercises the client's line buffer. */
function writeSplit(socket: Socket, s: string): void {
	const mid = Math.floor(s.length / 2);
	socket.write(s.slice(0, mid));
	setImmediate(() => socket.write(s.slice(mid)));
}

test('runWorkflowStream: forwards progress/delta frames then resolves on done', async () => {
	const daemon = fakeDaemon((req, socket) => {
		const id = (req as { id: number }).id;
		// Two progress-ish frames, then done — written split to test buffering.
		const frames =
			JSON.stringify({ id, stream: 'progress', data: { kind: 'stage', operation: 'workflow.run', stageId: 'decompose', stageLabel: 'decompose', index: 0, total: null } }) + '\n' +
			JSON.stringify({ id, stream: 'delta', data: { kind: 'token', operation: 'workflow.run', stageId: 'synthesize', tokensDelta: 16, tokensTotal: 16 } }) + '\n' +
			JSON.stringify({ id, stream: 'done', data: { path: '/x/PLAN.md', runId: 'wf-1', model: 'ollama:test', artifact: { ok: true }, review: { verdict: 'pass', counts: { high: 0, med: 0, low: 1 } } } }) + '\n';
		writeSplit(socket, frames);
	});
	await listen(daemon.server, daemon.path);

	const frames: Array<{ stream: string; data: unknown }> = [];
	try {
		const out = await runWorkflowStream(
			{ workflow: 'plan', focus: 'x' },
			{ onFrame: (stream, data) => frames.push({ stream, data }) },
			{ connect: () => createConnection(daemon.path) },
		);

		assert.equal(frames.length, 2, 'both non-terminal frames forwarded');
		assert.equal(frames[0]!.stream, 'progress');
		assert.equal(frames[1]!.stream, 'delta');
		assert.equal(out.path, '/x/PLAN.md');
		assert.equal(out.runId, 'wf-1');
		assert.equal(out.model, 'ollama:test');
		assert.deepEqual(out.artifact, { ok: true });
		assert.deepEqual(out.review, { verdict: 'pass', counts: { high: 0, med: 0, low: 1 } });
	} finally {
		await daemon.close();
	}
});

test('runWorkflowStream: rejects on an error frame', async () => {
	const daemon = fakeDaemon((req, socket) => {
		const id = (req as { id: number }).id;
		socket.write(JSON.stringify({ id, stream: 'error', data: { error: 'boom', recoverable: false } }) + '\n');
	});
	await listen(daemon.server, daemon.path);
	try {
		await assert.rejects(
			runWorkflowStream({ workflow: 'plan', focus: 'x' }, { onFrame: () => {} }, { connect: () => createConnection(daemon.path) }),
			/boom/,
		);
	} finally {
		await daemon.close();
	}
});

test('runWorkflowStream: aborting the signal destroys the socket and rejects', async () => {
	let serverSawClose = false;
	const daemon = fakeDaemon((req, socket) => {
		const id = (req as { id: number }).id;
		socket.on('close', () => { serverSawClose = true; });
		// Send one progress frame, then hang (never send done) — simulating a
		// long run the client wants to abort.
		socket.write(JSON.stringify({ id, stream: 'progress', data: { kind: 'stage', operation: 'workflow.run', stageId: 'grounding', stageLabel: 'grounding', index: 0, total: null } }) + '\n');
	});
	await listen(daemon.server, daemon.path);

	const ac = new AbortController();
	const p = runWorkflowStream(
		{ workflow: 'plan', focus: 'x' },
		{ onFrame: () => { ac.abort(); }, signal: ac.signal },   // abort as soon as the first frame lands
		{ connect: () => createConnection(daemon.path) },
	);
	try {
		await assert.rejects(p, /aborted by client/);
		// Give the server a tick to observe the client-side destroy.
		await new Promise((r) => setTimeout(r, 20));
		assert.equal(serverSawClose, true, 'daemon socket closed by the abort → daemon run aborts');
	} finally {
		await daemon.close();
	}
});

test('runWorkflowStream: pre-aborted signal rejects without connecting', async () => {
	const ac = new AbortController();
	ac.abort();
	await assert.rejects(
		runWorkflowStream(
			{ workflow: 'plan', focus: 'x' },
			{ onFrame: () => {}, signal: ac.signal },
			{ connect: () => createConnection(join(tmpdir(), 'insrc-never.sock')) },
		),
		/aborted by client/,
	);
});

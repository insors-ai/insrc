/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The two review stream helpers (`workflow.review`, `codeReview.run`) against a
 * fake daemon on a real unix socket.
 * (LLD-1716f77ba9ba017b-S001, test T11; plan task t5.)
 */

import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { codeReviewStream, reviewArtifactStream, ReviewStreamError } from '../daemon-stream.js';
import type { ReviewStreamDeps, ReviewStreamOpts } from '../daemon-stream.js';

interface Req { id: number; method: string; stream: boolean; params: Record<string, unknown> }

async function fakeDaemon(onRequest: (req: Req, socket: Socket) => void) {
	const path = join(tmpdir(), `insrc-rs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sock`);
	const sockets: Socket[] = [];
	const requests: Req[] = [];
	const server: Server = createServer((socket) => {
		sockets.push(socket);
		let buffer = '';
		socket.on('data', (chunk: Buffer) => {
			buffer += chunk.toString();
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';
			for (const line of lines) {
				if (!line.trim()) continue;
				const req = JSON.parse(line) as Req;
				requests.push(req);
				onRequest(req, socket);
			}
		});
		socket.on('error', () => { /* client vanished */ });
	});
	await new Promise<void>((res) => server.listen(path, () => res()));
	return {
		path, requests,
		openSockets: () => sockets.filter(s => !s.destroyed).length,
		close: async () => {
			for (const s of sockets) s.destroy();
			await new Promise<void>((res) => server.close(() => res()));
			try { rmSync(path); } catch { /* ignore */ }
		},
	};
}

const line = (o: unknown): string => JSON.stringify(o) + '\n';

/** A timer that never fires by itself; `fire()` fires the pending one. */
function manualTimer() {
	let pending: (() => void) | undefined;
	const set: number[] = [];
	return {
		deps: {
			setTimer: (fn: () => void, ms: number) => { pending = fn; set.push(ms); return 1; },
			clearTimer: () => { pending = undefined; },
		} satisfies ReviewStreamDeps,
		set,
		isPending: () => pending !== undefined,
		fire: () => { const fn = pending; pending = undefined; fn?.(); },
	};
}

const OPTS: ReviewStreamOpts = { timeoutMs: 10 * 60_000 };

/** The two helpers, called the same way, so every rule is checked for both. */
const HELPERS = [
	{
		name: 'reviewArtifactStream', method: 'workflow.review',
		call: (opts: ReviewStreamOpts, deps: ReviewStreamDeps) => reviewArtifactStream({ artifactPath: '/r/LLD.md', repo: '/r' }, opts, deps) as Promise<unknown>,
		params: { artifactPath: '/r/LLD.md', repo: '/r' },
		done: { artifactPath: '/r/LLD.md', verdict: 'warn', counts: { high: 0, med: 0, low: 3, unverified: 1 }, reviewedBy: 'daemon', model: 'm', applied: 0, pending: 1, report: 'r' },
	},
	{
		name: 'codeReviewStream', method: 'codeReview.run',
		call: (opts: ReviewStreamOpts, deps: ReviewStreamDeps) => codeReviewStream({ repo: '/r', epicHash: 'abcd', storyId: 'S001', groundingMode: 'degraded' }, opts, deps) as Promise<unknown>,
		params: { epicHash: 'abcd', storyId: 'S001', repo: '/r', groundingMode: 'degraded' },
		done: { runId: 'cr-1', artifact: { meta: { reviewedBy: 'daemon' }, body: { verdict: 'pass' } } },
	},
] as const;

function isFailure(failure: string, message?: RegExp) {
	return (e: unknown): boolean => {
		assert.ok(e instanceof ReviewStreamError, `got ${String(e)}`);
		assert.equal(e.failure, failure);
		if (message !== undefined) assert.match(e.message, message);
		return true;
	};
}

for (const h of HELPERS) {
	test(`T11 ${h.name}: sends one stream request, forwards progress, resolves on done`, async () => {
		const d = await fakeDaemon((req, socket) => {
			const payload = line({ id: req.id, stream: 'progress', data: { stageId: 'a' } }) + line({ id: req.id, stream: 'done', data: h.done });
			const mid = Math.floor(payload.length / 2);   // split mid-line: the helper must buffer
			socket.write(payload.slice(0, mid));
			setImmediate(() => socket.write(payload.slice(mid)));
		});
		try {
			const t = manualTimer();
			const seen: unknown[] = [];
			const res = await h.call({ ...OPTS, onFrame: (s, data) => seen.push([s, data]) }, { connect: () => createConnection(d.path), ...t.deps });
			assert.deepEqual(res, h.done);
			assert.deepEqual(seen, [['progress', { stageId: 'a' }]]);
			assert.equal(d.requests.length, 1);
			assert.equal(d.requests[0]!.method, h.method);
			assert.equal(d.requests[0]!.stream, true);
			assert.deepEqual(d.requests[0]!.params, h.params);
			assert.deepEqual(t.set, [OPTS.timeoutMs], 'the wait limit it was given is the one it arms');
			assert.equal(t.isPending(), false, 'the timer is cleared once the request is settled');
		} finally { await d.close(); }
	});

	test(`T11 ${h.name}: rejects on an error frame and carries the daemon's reason`, async () => {
		const d = await fakeDaemon((req, socket) => socket.write(line({ id: req.id, stream: 'error', data: { error: 'Same-party review refused: …', reason: 'same-party-review', recoverable: false } })));
		try {
			const t = manualTimer();
			await assert.rejects(h.call(OPTS, { connect: () => createConnection(d.path), ...t.deps }), (e: unknown) => {
				isFailure('daemon-error', /Same-party review refused/)(e);
				assert.equal((e as ReviewStreamError).reason, 'same-party-review');
				return true;
			});
			assert.equal(t.isPending(), false);
		} finally { await d.close(); }
	});

	test(`T11 ${h.name}: rejects when the daemon is not running`, async () => {
		const t = manualTimer();
		const gone = join(tmpdir(), `insrc-rs-none-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sock`);
		await assert.rejects(h.call(OPTS, { connect: () => createConnection(gone), ...t.deps }), isFailure('unreachable', /daemon is not running/));
		assert.equal(t.isPending(), false);
	});

	test(`T11 ${h.name}: rejects when the connection closes before a final frame`, async () => {
		const d = await fakeDaemon((req, socket) => { socket.write(line({ id: req.id, stream: 'progress', data: {} })); socket.end(); });
		try {
			const t = manualTimer();
			await assert.rejects(h.call(OPTS, { connect: () => createConnection(d.path), ...t.deps }), isFailure('closed', /closed before completion/));
		} finally { await d.close(); }
	});

	test(`T11 ${h.name}: a plain unknown-method line with the socket kept open fails AT ONCE, not at the timer`, async () => {
		// What an older daemon does (src/daemon/server.ts): one plain line, socket left open.
		const d = await fakeDaemon((req, socket) => socket.write(line({ id: req.id, error: `unknown method: ${req.method}` })));
		try {
			const t = manualTimer();   // never fires by itself: a rejection here cannot be the timer's
			await assert.rejects(
				h.call(OPTS, { connect: () => createConnection(d.path), ...t.deps }),
				isFailure('unknown-method', /Update the daemon and restart it/),
			);
			assert.equal(t.isPending(), false, 'settled by the line, and the timer was cleared');
		} finally { await d.close(); }
	});

	test(`T11 ${h.name}: any other plain error line is a final daemon error; a plain result is a protocol error`, async () => {
		const plainError = await fakeDaemon((req, socket) => socket.write(line({ id: req.id, error: 'handler exploded' })));
		const plainResult = await fakeDaemon((req, socket) => socket.write(line({ id: req.id, result: { ok: true } })));
		try {
			const t = manualTimer();
			await assert.rejects(h.call(OPTS, { connect: () => createConnection(plainError.path), ...t.deps }), isFailure('daemon-error', /handler exploded/));
			await assert.rejects(h.call(OPTS, { connect: () => createConnection(plainResult.path), ...t.deps }), isFailure('protocol', /plain result/));
		} finally { await plainError.close(); await plainResult.close(); }
	});

	test(`T11 ${h.name}: with a daemon that never answers, it fails at its wait limit and drops the connection`, async () => {
		const d = await fakeDaemon(() => { /* silent */ });
		try {
			const t = manualTimer();
			const p = h.call(OPTS, { connect: () => createConnection(d.path), ...t.deps });
			let settled = false;
			p.then(() => { settled = true; }, () => { settled = true; });
			while (d.requests.length === 0) await new Promise(r => setImmediate(r));
			assert.equal(settled, false, 'still waiting while the timer has not fired');
			t.fire();
			await assert.rejects(p, isFailure('timeout', /within 10 minutes/));
			while (d.openSockets() > 0) await new Promise(r => setImmediate(r));
		} finally { await d.close(); }
	});

	test(`T11 ${h.name}: an invalid line is a protocol error; an abort rejects`, async () => {
		const d = await fakeDaemon((_req, socket) => socket.write('not json\n'));
		const silent = await fakeDaemon(() => { /* silent */ });
		try {
			const t = manualTimer();
			await assert.rejects(h.call(OPTS, { connect: () => createConnection(d.path), ...t.deps }), isFailure('protocol', /invalid frame/));
			const ac = new AbortController();
			const p = h.call({ ...OPTS, signal: ac.signal }, { connect: () => createConnection(silent.path), ...t.deps });
			while (silent.requests.length === 0) await new Promise(r => setImmediate(r));
			ac.abort();
			await assert.rejects(p, isFailure('aborted'));
			const pre = new AbortController(); pre.abort();
			await assert.rejects(h.call({ ...OPTS, signal: pre.signal }, { connect: () => { throw new Error('must not connect'); }, ...t.deps }), isFailure('aborted'));
		} finally { await d.close(); await silent.close(); }
	});
}

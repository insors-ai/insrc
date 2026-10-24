/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s3/t4: the approval exchange over the real unix-socket IpcServer and
 * the real broker. The handlers are the ones the daemon registers (createApprovalRpc).
 * Run: npx tsx --test src/daemon/tools/__tests__/approval-ipc.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApprovalRpc } from '../../approval.js';
import { ApprovalBroker } from '../../approval-broker.js';
import { IpcServer } from '../../server.js';
import type { ApprovalGateFrame, ApprovalRequest } from '../../../shared/types.js';

let seq = 0;
function req(): ApprovalRequest {
	seq += 1;
	return { requestId: `ipc${seq}`, toolId: 'git_push', approvalClass: 'destructive', repoPath: '/work/repo', arguments: { remote: 'origin', ref: 'main', force: true }, preview: { title: 'git push --force', content: 'origin main' }, reason: 'force push', expiresAt: new Date(Date.now() + 60_000).toISOString() };
}

class Peer {
	private readonly lines: string[] = [];
	private waiting: Array<() => void> = [];
	private nextId = 1;
	private constructor(private readonly socket: Socket) {
		let buf = '';
		socket.on('data', c => {
			buf += c.toString();
			const parts = buf.split('\n'); buf = parts.pop() ?? '';
			for (const p of parts) if (p.trim()) { this.lines.push(p); this.waiting.splice(0).forEach(w => w()); }
		});
		socket.on('error', () => {});
	}
	static connect(path: string): Promise<Peer> {
		return new Promise((resolve, reject) => { const s = createConnection(path, () => resolve(new Peer(s))); s.on('error', reject); });
	}
	send(obj: Record<string, unknown>): number { const id = this.nextId++; this.socket.write(JSON.stringify({ id, ...obj }) + '\n'); return id; }
	async next(match: (m: Record<string, unknown>) => boolean, ms = 3000): Promise<Record<string, unknown>> {
		const deadline = Date.now() + ms;
		for (;;) {
			const i = this.lines.findIndex(l => match(JSON.parse(l) as Record<string, unknown>));
			if (i >= 0) return JSON.parse(this.lines.splice(i, 1)[0]!) as Record<string, unknown>;
			if (Date.now() > deadline) throw new Error('timed out waiting for a frame');
			await new Promise<void>(r => { this.waiting.push(r); setTimeout(r, 50); });
		}
	}
	async gate(): Promise<ApprovalGateFrame> { return (await this.next(m => m['stream'] === 'gate'))['data'] as ApprovalGateFrame; }
	subscribe(): void { this.send({ method: 'approval.subscribe', params: {}, stream: true }); }
	async answer(requestId: string, decision: 'approve' | 'decline'): Promise<Record<string, unknown>> {
		const id = this.send({ method: 'approval.answer', params: { requestId, decision } });
		return this.next(m => m['id'] === id && m['stream'] === undefined);
	}
	close(): void { this.socket.destroy(); }
}

async function withServer(fn: (ctx: { broker: ApprovalBroker; path: string }) => Promise<void>): Promise<void> {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-approval-ipc-'));
	const path = join(dir, 'd.sock');
	const broker = new ApprovalBroker();
	const rpc = createApprovalRpc(broker);
	const server = new IpcServer({ 'approval.answer': rpc.answer }, { 'approval.subscribe': rpc.subscribe }, Date.now, path);
	await server.listen();
	try { await fn({ broker, path }); } finally { await server.close(); rmSync(dir, { recursive: true, force: true }); }
}

test('approval-ipc.test.ts: a subscribed client receives the gate frame for a pending request and its answer resolves it', async () => {
	await withServer(async ({ broker, path }) => {
		const client = await Peer.connect(path);
		client.subscribe();
		await new Promise(r => setTimeout(r, 50));
		const r = req();
		const pending = broker.ask(r);
		const frame = await client.gate();
		assert.deepEqual(frame, { type: 'request', request: r }, 'the client sees the exact call');
		assert.deepEqual((await client.answer(r.requestId, 'approve'))['result'], { accepted: true });
		assert.deepEqual(await pending, { requestId: r.requestId, decision: 'approve' });
		assert.deepEqual(await client.gate(), { type: 'cancel', requestId: r.requestId, reason: 'answered' });
		client.close();
	});
});

test('approval-ipc.test.ts: a client that subscribes after the request was raised receives it and answers with approval.answer', async () => {
	await withServer(async ({ broker, path }) => {
		const first = await Peer.connect(path); first.subscribe();
		await new Promise(r => setTimeout(r, 50));
		const r = req(); const pending = broker.ask(r);
		const late = await Peer.connect(path); late.subscribe();
		assert.deepEqual(await late.gate(), { type: 'request', request: r });
		assert.deepEqual((await late.answer(r.requestId, 'decline'))['result'], { accepted: true });
		assert.equal(await pending, 'declined');
		first.close(); late.close();
	});
});

test('approval-ipc.test.ts: an answer for an unknown request id returns accepted false', async () => {
	await withServer(async ({ path }) => {
		const c = await Peer.connect(path);
		assert.deepEqual((await c.answer('never-raised', 'approve'))['result'], { accepted: false });
		const bad = c.send({ method: 'approval.answer', params: { requestId: 5 } });
		assert.match(String((await c.next(m => m['id'] === bad))['error']), /approval\.answer needs/);
		c.close();
	});
});

test('approval-ipc.test.ts: disconnecting the only subscriber resolves pending requests to no-client', async () => {
	await withServer(async ({ broker, path }) => {
		const c = await Peer.connect(path); c.subscribe();
		await new Promise(r => setTimeout(r, 50));
		const pending = broker.ask(req());
		await c.gate();
		c.close();
		assert.equal(await pending, 'no-client');
		assert.equal(broker.pendingCount, 0);
	});
});

test('approval-ipc.test.ts: a cancelled request sends a cancel frame over the socket', async () => {
	await withServer(async ({ broker, path }) => {
		const c = await Peer.connect(path); c.subscribe();
		await new Promise(r => setTimeout(r, 50));
		const abort = new AbortController(); const r = req();
		const pending = broker.ask(r, abort.signal);
		assert.equal((await c.gate()).type, 'request');
		abort.abort();
		assert.equal(await pending, 'cancelled');
		assert.deepEqual(await c.gate(), { type: 'cancel', requestId: r.requestId, reason: 'cancelled' });
		c.close();
	});
});

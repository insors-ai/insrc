/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Thread channel and hub client (Epic 86197ac6, Story s1, t3), across a real
 * worker thread.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/channel.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, Worker } from 'node:worker_threads';

import { RequestLifetime } from '../../request-context.js';
import { serveHub, wireRequest } from '../channel.js';

const HERE = dirname(fileURLToPath(import.meta.url));

interface Report { readonly op: string; readonly ok: boolean; readonly value?: unknown; readonly name?: string; readonly message?: string }

function startWorker(calls: readonly { op: string; args: unknown }[]): { worker: Worker; main: MessagePort; reports: (n: number) => Promise<Report[]> } {
	const { port1: main, port2: workerPort } = new MessageChannel();
	const worker = new Worker(join(HERE, 'helpers', 'hub-worker.ts'), { workerData: { port: workerPort, calls }, transferList: [workerPort] });
	const got: Report[] = [];
	const waiters: { n: number; resolve: (r: Report[]) => void }[] = [];
	worker.on('message', (r: Report) => {
		got.push(r);
		for (const w of waiters.splice(0)) { if (got.length >= w.n) w.resolve([...got]); else waiters.push(w); }
	});
	return { worker, main, reports: (n) => new Promise(resolve => { if (got.length >= n) resolve([...got]); else waiters.push({ n, resolve }); }) };
}
type MessagePort = InstanceType<typeof MessageChannel>['port1'];

test("a worker's hub request is answered with its own requestId", async () => {
	const seen: string[] = [];
	const { worker, main, reports } = startWorker([
		{ op: 'echo', args: { n: 1 } },
		{ op: 'slow-echo', args: { n: 2 } },
		{ op: 'boom', args: null },
		{ op: 'missing', args: null },
	]);
	// The slow one answers after the next, so answers arrive out of order and
	// must be matched to their requests by requestId.
	serveHub(main, {
		'echo': (a) => { seen.push('echo'); return a; },
		'slow-echo': async (a) => { seen.push('slow-echo'); await new Promise(r => setTimeout(r, 30)); return a; },
		'boom': () => { throw new TypeError('service failed'); },
	});
	try {
		const all = await reports(5);
		const byOp = new Map(all.map(r => [r.op, r]));
		assert.deepEqual(byOp.get('echo'), { op: 'echo', ok: true, value: { n: 1 } });
		assert.deepEqual(byOp.get('slow-echo'), { op: 'slow-echo', ok: true, value: { n: 2 } });
		assert.deepEqual(byOp.get('boom'), { op: 'boom', ok: false, name: 'TypeError', message: 'service failed' });
		assert.equal(byOp.get('missing')?.ok, false);
		assert.match(byOp.get('missing')?.message ?? '', /no hub service for 'missing'/);
		assert.deepEqual(seen.sort(), ['echo', 'slow-echo']);
	} finally {
		main.close();
		await worker.terminate();
	}
});

test('closing the port rejects every pending hub request with HubUnavailableError', async () => {
	const { worker, main, reports } = startWorker([
		{ op: 'never-a', args: null },
		{ op: 'never-b', args: null },
		{ op: 'never-c', args: null },
	]);
	// No service answers: every request stays pending until the port closes.
	try {
		const [sent] = await reports(1);
		assert.deepEqual(sent, { op: 'sent', ok: true, value: 3 }, 'three requests are pending');
		main.close();
		const all = await reports(4);
		const failed = all.filter(r => r.op.startsWith('never-'));
		assert.equal(failed.length, 3, 'every pending request is settled');
		for (const r of failed) {
			assert.equal(r.ok, false);
			assert.equal(r.name, 'HubUnavailableError');
			assert.match(r.message ?? '', /the hub port closed/);
		}
	} finally {
		await worker.terminate();
	}
});

test('wireRequest with ack asks for the completion message for unary and stream requests; without it the rule is unchanged (ISSUE-7c39e5cd)', () => {
	const unary = { kind: 'request' as const, requestId: 'u', method: 'x.m', params: null, stream: false };
	const stream = { ...unary, requestId: 's', stream: true };
	const tracked = { ...stream, requestId: 't', lifetime: new RequestLifetime() };
	for (const r of [unary, stream, tracked]) assert.equal(wireRequest(r, { ack: true }).trackCompletion, true, `${r.requestId}: acked`);
	assert.equal('trackCompletion' in wireRequest(unary), false, 'a unary request without ack asks for none');
	assert.equal('trackCompletion' in wireRequest(stream), false, 'nor a stream without a lifetime');
	assert.equal(wireRequest(tracked).trackCompletion, true, 'a stream with a lifetime still does');
	assert.deepEqual(wireRequest(unary, {}), wireRequest(unary), 'no option is the same envelope');
});

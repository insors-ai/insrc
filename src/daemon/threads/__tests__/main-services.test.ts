/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The main thread's services for its workers and the worker request entry
 * (Epic 86197ac6, Story s2, t8): a worker connected through ThreadServices
 * serves request envelopes as the socket server does in-thread, takes the
 * embedding backend the main thread decided, and daemon.info answers.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/main-services.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-main-services-'));
process.env['HOME'] = HOME;
const { PATHS } = await import('../../../shared/paths.js');
const { CONFIG_CATALOG } = await import('../../../config/config-catalog.js');
const { HubClient } = await import('../channel.js');
const { DAEMON_INFO_OP, ThreadServices, threadsEnabled } = await import('../main-services.js');
const { SERVING_THREAD_METHOD } = await import('../worker-requests.js');
import type { FrameEnvelope, ReplyEnvelope } from '../channel.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const INFO = { startedAt: 1_000, modelState: { status: 'ready' }, installedCommit: 'abc123', lmdbFileSizeMb: 7 };
const services = new ThreadServices(() => INFO);
const workers: Worker[] = [];

after(async () => {
	for (const w of workers) await w.terminate();
	rmSync(HOME, { recursive: true, force: true });
});

/** Start a request worker over a fresh connection; `send` posts envelopes, `next` awaits the next one. */
async function startWorker(): Promise<{ worker: Worker; port: MessagePort; next: (pred: (m: unknown) => boolean) => Promise<unknown> }> {
	const conn = services.connectWorker();
	const worker = new Worker(join(HERE, 'helpers', 'request-worker.ts'), {
		workerData: conn.workerData, transferList: conn.transferList, env: { ...process.env, INSRC_TEST_HOOKS: '1' },
	});
	workers.push(worker);
	const inbox: unknown[] = [];
	const waiting: { pred: (m: unknown) => boolean; resolve: (m: unknown) => void; reject: (e: Error) => void }[] = [];
	// A worker that errs or exits fails every wait at once, instead of leaving the test hanging.
	let gone: Error | undefined;
	const fail = (e: Error): void => { gone ??= e; for (const w of waiting.splice(0)) w.reject(e); };
	worker.on('error', err => fail(err));
	worker.on('exit', code => fail(new Error(`the worker exited (code ${code})`)));
	const take = (m: unknown): void => {
		const i = waiting.findIndex(w => w.pred(m));
		if (i >= 0) waiting.splice(i, 1)[0]!.resolve(m); else inbox.push(m);
	};
	conn.port.on('message', take);
	worker.on('message', take);
	const next = (pred: (m: unknown) => boolean): Promise<unknown> => {
		const i = inbox.findIndex(pred);
		if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
		if (gone !== undefined) return Promise.reject(gone);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('timed out waiting for a worker message')), 30_000);
			waiting.push({ pred, resolve: m => { clearTimeout(timer); resolve(m); }, reject: e => { clearTimeout(timer); reject(e); } });
		});
	};
	await next(m => m === 'ready');
	return { worker, port: conn.port, next };
}

const forRequest = (id: string) => (m: unknown): boolean => (m as { requestId?: string }).requestId === id;

test('a worker started with the request entry answers a request, relays stream frames, aborts on cancel and names an uncloneable reply', async () => {
	const { worker, port, next } = await startWorker();
	const ask = (requestId: string, method: string, params: unknown, stream = false): void =>
		port.postMessage({ kind: 'request', requestId, method, params, stream });

	ask('1', 'x.echo', { a: 1 });
	const echo = await next(forRequest('1')) as ReplyEnvelope;
	assert.deepEqual(echo, { kind: 'reply', requestId: '1', result: { echo: { a: 1 }, threadId: worker.threadId } }, 'served on the worker thread');

	ask('2', 'x.fail', null);
	assert.deepEqual(await next(forRequest('2')), { kind: 'reply', requestId: '2', error: 'handler failed' });
	ask('3', 'no.such', null);
	assert.deepEqual(await next(forRequest('3')), { kind: 'reply', requestId: '3', error: 'unknown method: no.such' });

	ask('4', 's.count', null, true);
	const frames = [await next(forRequest('4')), await next(forRequest('4'))] as FrameEnvelope[];
	assert.deepEqual(frames.map(f => f.frame), [{ id: 0, stream: 'progress', data: { n: 1 } }, { id: 0, stream: 'done', data: { n: 2 } }]);

	ask('5', 's.wait', null, true);
	await next(forRequest('5'));
	port.postMessage({ kind: 'cancel', requestId: '5' });
	assert.deepEqual(await next(m => (m as { aborted?: string }).aborted !== undefined), { aborted: 's.wait' }, 'the cancel aborted the stream handler');

	ask('6', 'x.uncloneable', null);
	const named = await next(forRequest('6')) as ReplyEnvelope;
	assert.match(named.error ?? '', /^the result of x\.uncloneable could not be returned: /);
	ask('7', 's.uncloneable', null, true);
	const frame = (await next(forRequest('7')) as FrameEnvelope).frame as { stream: string; data: { error: string } };
	assert.equal(frame.stream, 'error');
	assert.match(frame.data.error, /^the result of s\.uncloneable could not be returned: /);

	ask('8', SERVING_THREAD_METHOD, null);
	assert.deepEqual(await next(forRequest('8')), { kind: 'reply', requestId: '8', result: { threadId: worker.threadId } }, 'the test hook reports the serving thread');
});

test('a worker started before the embedding bootstrap settles embeds with the decided backend after the push', async () => {
	const early = await startWorker();
	early.port.postMessage({ kind: 'request', requestId: 'b1', method: 'x.backend', params: null, stream: false });
	assert.deepEqual(await early.next(forRequest('b1')), { kind: 'reply', requestId: 'b1', result: 'unknown' }, 'nothing decided yet');

	services.setEmbedderBackend('onnx');
	// The push travels on the same port before the next request's reply.
	early.port.postMessage({ kind: 'request', requestId: 'b2', method: 'x.backend', params: null, stream: false });
	assert.deepEqual(await early.next(forRequest('b2')), { kind: 'reply', requestId: 'b2', result: 'onnx' }, 'the worker started early took the pushed backend');

	const late = await startWorker();
	late.port.postMessage({ kind: 'request', requestId: 'b3', method: 'x.backend', params: null, stream: false });
	assert.deepEqual(await late.next(forRequest('b3')), { kind: 'reply', requestId: 'b3', result: 'onnx' }, 'a worker started after the decision gets it when it connects');
});

test('daemon.threads.enabled is a config schema key defaulting to on and daemon.info returns its four fields', async () => {
	const row = CONFIG_CATALOG.find(o => o.path === 'daemon.threads.enabled');
	assert.deepEqual(row && { type: row.type, default: row.default, group: row.group }, { type: 'boolean', default: true, group: 'General' });

	assert.equal(threadsEnabled(), true, 'no config file: on (the default)');
	mkdirSync(dirname(PATHS.config), { recursive: true });
	writeFileSync(PATHS.config, JSON.stringify({ daemon: { threads: { enabled: false } } }));
	assert.equal(threadsEnabled(), false, 'an explicit false turns it off');
	writeFileSync(PATHS.config, JSON.stringify({ daemon: { threads: { enabled: true } } }));
	assert.equal(threadsEnabled(), true);
	writeFileSync(PATHS.config, JSON.stringify({ daemon: { threads: { enabled: 'no' } } }));
	assert.equal(threadsEnabled(), true, 'only false turns it off');
	writeFileSync(PATHS.config, '{not json');
	assert.equal(threadsEnabled(), true, 'an unreadable config: the default');

	const conn = services.connectWorker();
	const hub = new HubClient(conn.workerData.hubPort);
	assert.deepEqual(await hub.request(DAEMON_INFO_OP, null), INFO);
	conn.disconnect();
	conn.workerData.hubPort.close();
});

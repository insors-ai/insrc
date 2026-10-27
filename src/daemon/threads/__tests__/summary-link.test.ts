/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The summary channel across a worker's exit (Epic 86197ac6, Story s2, t14):
 * when the summary worker goes, the code-indexing worker's job in flight fails
 * and the next waits for a replacement (or fails at shutdown); when the
 * code-indexing worker goes, the summary worker's job stops between documents
 * and an edit it asked for is answered with none. Both ends take a new port.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/summary-link.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MessageChannel } from 'node:worker_threads';

import type { IndexJob } from '../../../shared/types.js';
import { IndexingBlock, createIndexingBlock } from '../indexing-block.js';
import { SUMMARY_JOB, SUMMARY_TAKE_EDIT, SummaryRunner, SummaryWorkerLink } from '../summary-link.js';
import type { ChannelEnvelope } from '../channel.js';

const JOB: IndexJob = { kind: 'doc-summarise-repo', repoPath: '/r' } as IndexJob;
const settled = async (p: Promise<unknown>): Promise<string> => {
	const tick = new Promise(r => setTimeout(() => r('pending'), 50));
	return Promise.race([p.then(() => 'resolved', (e: Error) => `rejected: ${e.message}`), tick]) as Promise<string>;
};

test('the code-indexing end: a job in flight fails when the summary worker goes, the next waits for the replacement, and stop fails a waiting job', async () => {
	const first = new MessageChannel();
	const runner = new SummaryRunner(first.port1, () => undefined, () => {});
	const inFlight = runner.run(JOB);
	first.port2.close();   // the summary worker exited
	assert.equal(await settled(inFlight), 'rejected: summary job abandoned: the document-summary worker is gone');

	const waiting = runner.run(JOB);
	assert.equal(await settled(waiting), 'pending', 'no summary worker: the job waits');
	const second = new MessageChannel();
	second.port2.on('message', (m: ChannelEnvelope) => { if (m.kind === 'request' && m.method === SUMMARY_JOB) second.port2.postMessage({ kind: 'reply', requestId: m.requestId }); });
	runner.rebind(second.port1);
	assert.equal(await settled(waiting), 'resolved', 'it ran on the replacement');

	second.port2.close();
	await new Promise(r => setTimeout(r, 20));
	const atShutdown = runner.run(JOB);
	runner.stop();
	assert.equal(await settled(atShutdown), 'rejected: summary job abandoned: the code-indexing worker is stopping');
	second.port2.close();
});

test('the summary end: the code-indexing worker going stops the job and answers a pending edit with none; a job from the new one runs', async () => {
	const block = new IndexingBlock(createIndexingBlock());
	const first = new MessageChannel();
	const link = new SummaryWorkerLink(first.port1, block);
	const ran: IndexJob[] = [];
	link.serveJobs(async job => { ran.push(job); }, () => undefined);
	assert.equal(link.isStopping, false);

	const edit = link.takeDocSummaryEdit();
	first.port2.close();   // the code-indexing worker exited
	assert.equal(await settled(edit), 'resolved');
	assert.equal(await edit, undefined, 'no edit from a worker that is gone');
	assert.equal(link.isStopping, true, 'the abandoned job stops between documents');

	const second = new MessageChannel();
	link.rebind(second.port1);
	const done = new Promise(resolve => second.port2.on('message', (m: ChannelEnvelope) => { if (m.kind === 'reply') resolve(m); }));
	second.port2.postMessage({ kind: 'request', requestId: 'j1', method: SUMMARY_JOB, params: JOB, stream: true });
	assert.deepEqual(await done, { kind: 'reply', requestId: 'j1' });
	assert.deepEqual(ran, [JOB]);
	assert.equal(link.isStopping, false, 'the new job is not stopped');
	second.port2.close();
});

test('both ends speak the shared sc3 envelopes: a job is a streaming request with sweep frames and a reply, an edit is a unary request and its reply', async () => {
	const { port1, port2 } = new MessageChannel();
	const toSummary: ChannelEnvelope[] = [];
	const toCode: ChannelEnvelope[] = [];
	const block = new IndexingBlock(createIndexingBlock());
	// Watch every message each side receives.
	const tap = new MessageChannel();
	const tapBack = new MessageChannel();
	const runner = new SummaryRunner(tap.port1, () => ({ kind: 'doc-summarise-entity', entityId: 'e1' }), () => {});
	const link = new SummaryWorkerLink(tapBack.port1, block);
	tap.port2.on('message', (m: ChannelEnvelope) => { toSummary.push(m); tapBack.port2.postMessage(m); });
	tapBack.port2.on('message', (m: ChannelEnvelope) => { toCode.push(m); tap.port2.postMessage(m); });
	let swept = 0;
	link.serveJobs(async () => {
		swept = 1;
		assert.deepEqual(await link.takeDocSummaryEdit(), { kind: 'doc-summarise-entity', entityId: 'e1' }, 'the edit taken back over a unary request');
		await new Promise(r => setTimeout(r, 250));
	}, () => (swept ? { done: 1, total: 2 } as never : undefined));
	await runner.run(JOB);
	const job = toSummary.find(m => m.kind === 'request')!;
	assert.deepEqual(job, { kind: 'request', requestId: job.kind === 'request' ? job.requestId : '', method: SUMMARY_JOB, params: JOB, stream: true });
	const edit = toCode.find(m => m.kind === 'request')!;
	assert.equal(edit.kind === 'request' && edit.method, SUMMARY_TAKE_EDIT);
	assert.ok(toSummary.some(m => m.kind === 'reply' && edit.kind === 'request' && m.requestId === edit.requestId), 'the edit answered by a reply');
	assert.ok(toCode.some(m => m.kind === 'frame' && job.kind === 'request' && m.requestId === job.requestId), 'sweep progress as frames of the job');
	assert.equal(toCode.at(-1)!.kind, 'reply', 'the job ends with its reply');
	for (const m of [...toSummary, ...toCode]) assert.ok(['request', 'reply', 'frame'].includes(m.kind), `only sc3 envelopes: ${JSON.stringify(m)}`);
	for (const p of [port1, port2, tap.port1, tap.port2, tapBack.port1, tapBack.port2]) p.close();
});

test("a replacement code-indexing worker's job waits for the job the exited one handed over: never two at once", async () => {
	const block = new IndexingBlock(createIndexingBlock());
	const first = new MessageChannel();
	const link = new SummaryWorkerLink(first.port1, block);
	const events: string[] = [];
	let running = 0;
	let releaseFirst!: () => void;
	const firstGate = new Promise<void>(r => { releaseFirst = r; });
	link.serveJobs(async job => {
		running++;
		events.push(`start ${(job as { repoPath: string }).repoPath} (running ${running})`);
		if ((job as { repoPath: string }).repoPath === '/old') await firstGate;
		events.push(`end ${(job as { repoPath: string }).repoPath}`);
		running--;
	}, () => undefined);
	first.port2.postMessage({ kind: 'request', requestId: 'old', method: SUMMARY_JOB, params: { kind: 'doc-summarise-repo', repoPath: '/old' }, stream: true });
	await new Promise(r => setTimeout(r, 30));
	first.port2.close();   // the code-indexing worker exited; its job is still finishing
	await new Promise(r => setTimeout(r, 30));   // its port's close arrives before the replacement's port, as in the daemon
	const second = new MessageChannel();
	link.rebind(second.port1);
	const replied = new Promise(resolve => second.port2.on('message', (m: ChannelEnvelope) => { if (m.kind === 'reply') resolve(m); }));
	second.port2.postMessage({ kind: 'request', requestId: 'new', method: SUMMARY_JOB, params: { kind: 'doc-summarise-repo', repoPath: '/new' }, stream: true });
	await new Promise(r => setTimeout(r, 100));
	assert.deepEqual(events, ['start /old (running 1)'], 'the new job waits');
	assert.equal(link.isStopping, true, 'the abandoned job is told to stop between documents');
	releaseFirst();
	await replied;
	assert.deepEqual(events, ['start /old (running 1)', 'end /old', 'start /new (running 1)', 'end /new']);
	assert.equal(link.isStopping, false, 'the new job is not stopped');
	second.port2.close();
});

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
import { SummaryRunner, SummaryWorkerLink } from '../summary-link.js';

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
	second.port2.on('message', (m: { t: string; id: number }) => { if (m.t === 'job') second.port2.postMessage({ t: 'done', id: m.id }); });
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
	const done = new Promise(resolve => second.port2.on('message', (m: { t: string }) => { if (m.t === 'done') resolve(m); }));
	second.port2.postMessage({ t: 'job', id: 1, job: JOB });
	assert.deepEqual(await done, { t: 'done', id: 1 });
	assert.deepEqual(ran, [JOB]);
	assert.equal(link.isStopping, false, 'the new job is not stopped');
	second.port2.close();
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The index queue's reports to other threads (Epic 86197ac6, Story s2, t7):
 * the code-busy and stopping words in the indexing shared block, a lane
 * publish at every change, and pause/resume for maintenance compaction.
 *
 * Run: npx tsx --test src/daemon/__tests__/queue-threads.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { IndexQueue } from '../queue.js';
import { createIndexingBlock, IndexingBlock } from '../threads/indexing-block.js';
import type { LaneStatus, SummarySweepProgress } from '../threads/status-board.js';
import type { IndexJob } from '../../shared/types.js';

const A = '/repos/a';
const file = (name: string): IndexJob => ({ kind: 'file', filePath: join(A, name), event: 'update' });

function gate(): { wait: Promise<void>; open: () => void } {
	let open!: () => void;
	const wait = new Promise<void>(r => { open = r; });
	return { wait, open };
}
const tick = (): Promise<void> => new Promise(r => setImmediate(r));
async function until(cond: () => boolean, what: string): Promise<void> {
	for (let i = 0; i < 1000; i++) { if (cond()) return; await tick(); }
	assert.fail(`timed out waiting for: ${what}`);
}

test('the code-busy and stopping words track the index lane and stop()', async () => {
	const block = createIndexingBlock();
	const reader = new IndexingBlock(block);   // as the summary worker reads it
	const q = new IndexQueue({ indexingBlock: block });
	const gates = new Map<string, ReturnType<typeof gate>>();
	const running = q.start(async job => { if (job.kind === 'file') await (gates.get(job.filePath) ?? gate()).wait; });
	assert.deepEqual([reader.codeBusy, reader.stopping], [false, false]);

	// A summary job does not make code busy.
	q.enqueue({ kind: 'doc-summarise-entity', entityId: 'e1' });
	await tick();
	assert.equal(reader.codeBusy, false);

	// Queued and running index jobs do; the word clears when the lane is empty and idle.
	gates.set(join(A, 'a.ts'), gate());
	gates.set(join(A, 'b.ts'), gate());
	q.enqueue(file('a.ts'));
	assert.equal(reader.codeBusy, true, 'busy as soon as an index job is queued');
	q.enqueue(file('b.ts'));
	await until(() => q.laneStatus().index.running, 'a.ts to start');
	let waited = false;
	const idleWait = reader.waitForCodeIdle().then(() => { waited = true; });
	gates.get(join(A, 'a.ts'))!.open();
	await until(() => q.laneStatus().index.depth === 0 && q.laneStatus().index.running, 'b.ts to start');
	assert.equal(reader.codeBusy, true, 'still busy while b.ts runs');
	assert.equal(waited, false);
	gates.get(join(A, 'b.ts'))!.open();
	await idleWait;
	assert.equal(reader.codeBusy, false);

	// stop() sets the stopping word, which also ends a code-idle wait.
	gates.set(join(A, 'c.ts'), gate());
	q.enqueue(file('c.ts'));
	await until(() => q.laneStatus().index.running, 'c.ts to start');
	const stopWait = reader.waitForCodeIdle();
	q.stop();
	assert.equal(reader.stopping, true);
	await stopWait;
	gates.get(join(A, 'c.ts'))!.open();
	await running;
});

test('pause() resolves once no job is in flight and no job starts until resume()', async () => {
	const q = new IndexQueue();
	const started: string[] = [];
	const first = gate();
	const running = q.start(async job => {
		started.push(job.kind === 'file' ? job.filePath : job.kind);
		if (job.kind === 'file' && job.filePath.endsWith('a.ts')) await first.wait;
	});
	q.enqueue(file('a.ts'));
	q.enqueue({ kind: 'doc-summarise-repo', repoPath: '/repos/other' });
	await until(() => q.laneStatus().index.running, 'a.ts to start');
	// The summary job waits for the index lane (today's yield), so only a.ts is in flight.

	let paused = false;
	const pausing = q.pause().then(() => { paused = true; });
	await tick();
	assert.equal(paused, false, 'pause waits for the job in flight');
	q.enqueue(file('b.ts'));
	first.open();
	await pausing;
	assert.equal(q.isProcessing, false);
	// Nothing new starts while paused, in either lane, though jobs keep queueing.
	for (let i = 0; i < 20; i++) await tick();
	assert.deepEqual(started, [join(A, 'a.ts')]);
	assert.deepEqual([q.laneStatus().index.depth, q.laneStatus().summary.depth], [1, 1]);
	// A pause with nothing in flight resolves at once.
	await q.pause();

	q.resume();
	await until(() => started.length === 3, 'both queued jobs to run');
	assert.deepEqual(started, [join(A, 'a.ts'), join(A, 'b.ts'), 'doc-summarise-repo'], 'the index job first, then the summary (lane order and yield unchanged)');
	q.stop();
	await running;

	// stop() while paused ends the drain loops.
	const q2 = new IndexQueue();
	const r2 = q2.start(async () => {});
	await q2.pause();
	q2.enqueue(file('x.ts'));
	q2.stop();
	await r2;
});

test('every lane change publishes the lane\'s depth and processing, and lane order and the summary yield are unchanged', async () => {
	const published: string[] = [];
	let sweep: SummarySweepProgress | undefined;
	const fmt = (lane: string, s: LaneStatus, sw?: SummarySweepProgress): string =>
		`${lane} ${s.depth}${s.processing ? ' running' : ''}${sw ? ` sweep ${sw.done}/${sw.total}` : ''}`;
	const q = new IndexQueue({ publishLane: (lane, s, sw) => { published.push(fmt(lane, s, sw)); }, sweepProgress: () => sweep });
	const order: string[] = [];
	const indexGate = gate();
	const running = q.start(async job => {
		order.push(job.kind === 'file' ? `file ${job.filePath.slice(A.length + 1)}` : job.kind);
		if (job.kind === 'file' && job.filePath.endsWith('a.ts')) await indexGate.wait;
	});
	q.enqueue(file('a.ts'));
	await until(() => q.laneStatus().index.running, 'a.ts to start');
	q.enqueue({ kind: 'doc-summarise-repo', repoPath: A });
	q.enqueue(file('b.ts'));
	indexGate.open();
	await until(() => order.length === 3, 'all three jobs');
	await until(() => !q.isProcessing, 'the queue to go idle');
	// The summary job waited for both index jobs.
	assert.deepEqual(order, ['file a.ts', 'file b.ts', 'doc-summarise-repo']);
	assert.deepEqual(published, [
		'index 1',            // a.ts queued
		'index 0 running',    // a.ts started
		'summary 1',          // the sweep queued
		'index 1 running',    // b.ts queued
		'index 1',            // a.ts done, b.ts still queued
		'index 0 running',    // b.ts started
		'index 0',            // b.ts done
		'summary 0 running',  // the sweep started
		'summary 0',          // the sweep done
	]);

	// takeDocSummaryEdit and a sweep-progress change publish the summary lane, with the sweep.
	published.length = 0;
	q.stop();
	await running;
	const q2 = new IndexQueue({ publishLane: (lane, s, sw) => { published.push(fmt(lane, s, sw)); }, sweepProgress: () => sweep });
	q2.enqueue({ kind: 'doc-summarise-entity', entityId: 'e' });
	sweep = { repoPath: A, done: 2, total: 5 };
	q2.lanesChanged();
	assert.deepEqual(q2.takeDocSummaryEdit(), { kind: 'doc-summarise-entity', entityId: 'e' });
	assert.deepEqual(published, ['summary 1', 'summary 1 sweep 2/5', 'summary 0 sweep 2/5']);
});

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story b94cf2c9 S001/t1 — the index queue runs an index lane and a summary
 * lane at the same time, so code indexing never waits behind a summary sweep.
 *
 * Run: npx tsx --test src/daemon/__tests__/queue-lanes.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';

import { IndexQueue } from '../queue.js';
import type { IndexJob } from '../../shared/types.js';

const A = '/repos/a';

/** A promise and the function that settles it. */
function gate(): { wait: Promise<void>; open: () => void } {
	let open!: () => void;
	const wait = new Promise<void>(r => { open = r; });
	return { wait, open };
}

const tick = (): Promise<void> => new Promise(r => setImmediate(r));

/** Poll until `cond` holds (bounded). */
async function until(cond: () => boolean, what: string): Promise<void> {
	for (let i = 0; i < 1000; i++) { if (cond()) return; await tick(); }
	assert.fail(`timed out waiting for: ${what}`);
}

const label = (job: IndexJob): string => {
	switch (job.kind) {
		case 'full': case 'reembed': case 'reconcile': case 'doc-summarise-repo': return `${job.kind}:${job.repoPath}`;
		case 'file': case 'config-file': return `${job.kind}:${job.filePath}`;
		case 'doc-summarise-entity': return `${job.kind}:${job.entityId}`;
		case 'config-full': case 'config-reindex': return job.kind;
	}
};

test('an index job enqueued while a summary job is running completes before that summary job finishes', async () => {
	const q = new IndexQueue();
	const summary = gate();
	let summaryDone = false;
	let indexDone = false;
	const running = q.start(async job => {
		if (job.kind === 'doc-summarise-repo') { await summary.wait; summaryDone = true; }
		if (job.kind === 'file') indexDone = true;
	});
	q.enqueue({ kind: 'doc-summarise-repo', repoPath: A });
	await until(() => q.laneStatus().summary.running, 'the sweep to start');
	q.enqueue({ kind: 'file', filePath: join(A, 'x.ts'), event: 'update' });
	await until(() => indexDone, 'the file job to finish');
	assert.equal(summaryDone, false, 'the file job finished while the sweep was still running');
	summary.open();
	await until(() => summaryDone, 'the sweep to finish');
	q.stop();
	await running;
});

test('each lane runs its jobs one at a time in order, every kind goes to its lane, and summaries queued with code work start only after it', async () => {
	const q = new IndexQueue();
	const jobs: IndexJob[] = [
		{ kind: 'full', repoPath: A },
		{ kind: 'doc-summarise-repo', repoPath: A },
		{ kind: 'file', filePath: join(A, 'x.ts'), event: 'update' },
		{ kind: 'reembed', repoPath: A },
		{ kind: 'reconcile', repoPath: A },
		{ kind: 'config-full', scope: { kind: 'global' } },
		{ kind: 'config-file', filePath: join(A, '.insrc', 'c.md'), scope: { kind: 'project', repoPath: A }, event: 'update' },
		{ kind: 'doc-summarise-repo', repoPath: '/repos/b' },
		{ kind: 'config-reindex', scope: { kind: 'project', repoPath: A } },
	];
	for (const j of jobs) q.enqueue(j);
	assert.deepEqual(q.laneStatus(), { index: { depth: 7, running: false }, summary: { depth: 2, running: false } });

	const order: Record<'index' | 'summary', string[]> = { index: [], summary: [] };
	const active = { index: 0, summary: 0 };
	let maxActive = { index: 0, summary: 0 };
	let overlapped = false;
	let lastIndexEnd = -1, firstSummaryStart = -1, clock = 0;
	const running = q.start(async job => {
		const lane = job.kind.startsWith('doc-summarise') ? 'summary' : 'index';
		active[lane]++;
		maxActive = { index: Math.max(maxActive.index, active.index), summary: Math.max(maxActive.summary, active.summary) };
		if (active.index > 0 && active.summary > 0) overlapped = true;
		if (lane === 'summary' && firstSummaryStart < 0) firstSummaryStart = clock++;
		order[lane].push(label(job));
		await tick(); await tick();
		active[lane]--;
		if (lane === 'index') lastIndexEnd = clock++;
	});
	await until(() => order.index.length + order.summary.length === jobs.length && q.depth === 0 && !q.isProcessing, 'every job to run');
	q.stop();
	await running;

	assert.deepEqual(order.index, jobs.filter(j => !j.kind.startsWith('doc-summarise')).map(label), 'the index lane runs in enqueue order');
	assert.deepEqual(order.summary, [`doc-summarise-repo:${A}`, 'doc-summarise-repo:/repos/b']);
	assert.deepEqual(maxActive, { index: 1, summary: 1 }, 'one job at a time in each lane');
	assert.equal(overlapped, false, 'the summary lane yields to queued code work (Story 0f0e4f45)');
	assert.ok(firstSummaryStart > lastIndexEnd, 'the first summary started after the last index job ended');
});

test('a single-document job goes ahead of a queued sweep, after earlier single-document jobs, and takeDocSummaryEdit removes and returns it', async () => {
	const q = new IndexQueue();
	q.enqueue({ kind: 'doc-summarise-repo', repoPath: A });
	q.enqueue({ kind: 'doc-summarise-entity', entityId: 'e1' });
	q.enqueue({ kind: 'doc-summarise-entity', entityId: 'e2' });
	q.enqueue({ kind: 'doc-summarise-entity', entityId: 'e1' }); // deduplicated

	const order: string[] = [];
	const running = q.start(async job => { order.push(label(job)); });
	await until(() => order.length === 3, 'the summary lane to drain');
	q.stop();
	await running;
	assert.deepEqual(order, ['doc-summarise-entity:e1', 'doc-summarise-entity:e2', `doc-summarise-repo:${A}`]);

	const q2 = new IndexQueue();
	q2.enqueue({ kind: 'doc-summarise-repo', repoPath: A });
	q2.enqueue({ kind: 'doc-summarise-entity', entityId: 'e1' });
	q2.enqueue({ kind: 'file', filePath: join(A, 'x.ts'), event: 'update' });
	q2.enqueue({ kind: 'doc-summarise-entity', entityId: 'e2' });
	assert.equal(q2.depth, 4);
	assert.deepEqual(q2.takeDocSummaryEdit(), { kind: 'doc-summarise-entity', entityId: 'e1' });
	assert.deepEqual(q2.takeDocSummaryEdit(), { kind: 'doc-summarise-entity', entityId: 'e2' });
	assert.equal(q2.takeDocSummaryEdit(), undefined);
	assert.equal(q2.depth, 2, 'a taken job is no longer queued');
	assert.deepEqual(q2.laneStatus(), { index: { depth: 1, running: false }, summary: { depth: 1, running: false } });
});

test('depth, isProcessing and depthForRepo span both lanes, codeIndexWorkFor reads the index lane only, and laneStatus reports each lane', async () => {
	const q = new IndexQueue();
	q.enqueue({ kind: 'doc-summarise-repo', repoPath: A });
	q.enqueue({ kind: 'doc-summarise-entity', entityId: 'e1' });
	q.enqueue({ kind: 'file', filePath: join(A, 'x.ts'), event: 'update' });
	assert.equal(q.depth, 3, 'depth counts both lanes');
	assert.equal(q.depthForRepo(A), 2, 'depthForRepo counts the queued sweep and the file job, not the single-document job');
	assert.deepEqual(q.codeIndexWorkFor(A), { inFlight: false, pending: 1 });
	assert.equal(q.isProcessing, false);

	const sweep = gate();
	const file = gate();
	const running = q.start(async job => {
		if (job.kind === 'doc-summarise-repo') await sweep.wait;
		if (job.kind === 'file') await file.wait;
	});
	// The index lane holds on the file; the summary lane waits for it with both summary jobs queued.
	await until(() => q.laneStatus().index.running, 'the file job to start');
	await tick(); await tick();
	assert.deepEqual(q.laneStatus(), { index: { depth: 0, running: true }, summary: { depth: 2, running: false } }, 'summaries wait behind code work');
	assert.equal(q.depth, 2);
	assert.equal(q.isProcessing, true);
	assert.deepEqual(q.codeIndexWorkFor(A), { inFlight: true, pending: 0 });
	file.open();
	// Code work done: the summary lane runs e1 (ahead of the sweep), then holds on the sweep.
	await until(() => q.depth === 0 && q.laneStatus().summary.running && !q.laneStatus().index.running, 'the sweep to start');
	assert.equal(q.isProcessing, true, 'the summary lane runs a job');
	assert.deepEqual(q.codeIndexWorkFor(A), { inFlight: false, pending: 0 }, 'a running sweep is not code-index work');
	assert.deepEqual(q.laneStatus(), { index: { depth: 0, running: false }, summary: { depth: 0, running: true } });
	sweep.open();
	await until(() => !q.isProcessing, 'the sweep to finish');
	q.stop();
	await running;
});

test('stop ends both lanes after their current jobs, and start resolves only then', async () => {
	const q = new IndexQueue();
	const sweep = gate();
	let ran = 0;
	q.enqueue({ kind: 'doc-summarise-repo', repoPath: A });
	q.enqueue({ kind: 'doc-summarise-repo', repoPath: '/repos/b' });
	let resolved = false;
	const running = q.start(async job => { ran++; if (job.kind === 'doc-summarise-repo' && job.repoPath === A) await sweep.wait; }).then(() => { resolved = true; });
	await until(() => q.laneStatus().summary.running, 'the sweep to start');
	assert.equal(q.isStopping, false);
	q.stop();
	assert.equal(q.isStopping, true);
	await tick(); await tick();
	assert.equal(resolved, false, 'start waits for the running job');
	sweep.open();
	await running;
	assert.equal(resolved, true);
	assert.equal(ran, 1, 'the second sweep was not started after stop');
	assert.equal(q.depth, 1, 'the second sweep is still queued');
	q.enqueue({ kind: 'file', filePath: join(A, 'x.ts'), event: 'update' });
	assert.equal(q.depth, 1, 'a stopped queue accepts nothing new');
});

test('waitForIndexIdle resolves at once when the index lane is idle, after its code work otherwise, and on stop(); a summary lane waiting for code work ends on stop()', async () => {
	const q = new IndexQueue();
	await q.waitForIndexIdle();   // idle: resolves at once

	const file = gate();
	let summaries = 0;
	const running = q.start(async job => {
		if (job.kind === 'file') await file.wait;
		if (job.kind === 'doc-summarise-entity') summaries++;
	});
	q.enqueue({ kind: 'file', filePath: join(A, 'x.ts'), event: 'update' });
	await until(() => q.laneStatus().index.running, 'the file job to start');
	let released = false;
	const waiting = q.waitForIndexIdle().then(() => { released = true; });
	q.enqueue({ kind: 'doc-summarise-entity', entityId: 'e1' });
	await tick(); await tick();
	assert.equal(released, false, 'not while code work runs');
	assert.equal(summaries, 0, 'no summary starts while code work runs');
	file.open();
	await waiting;
	await until(() => summaries === 1, 'the summary to run once code work is done');

	const file2 = gate();
	const q2 = new IndexQueue();
	let ran2 = 0;
	const running2 = q2.start(async job => { if (job.kind === 'file') await file2.wait; else ran2++; });
	q2.enqueue({ kind: 'file', filePath: join(A, 'y.ts'), event: 'update' });
	await until(() => q2.laneStatus().index.running, 'the second file job to start');
	q2.enqueue({ kind: 'doc-summarise-entity', entityId: 'e2' });
	await tick(); await tick();   // the summary lane is now waiting for code work
	assert.equal(q2.laneStatus().summary.depth, 1, 'its job is still queued');
	const waiter = q2.waitForIndexIdle();
	q2.stop();
	await waiter;   // released by stop()
	file2.open();
	await running2;
	assert.equal(ran2, 0, 'the waiting summary lane ended on stop() without starting its job');

	q.stop();
	await running;
});

test('a summary never starts after a code job was queued: with the index lane idle at start it starts at once, and a code job queued just after runs beside that one summary only', async () => {
	const q = new IndexQueue();
	const order: string[] = [];
	const file = gate();
	q.enqueue({ kind: 'doc-summarise-entity', entityId: 'e1' });
	q.enqueue({ kind: 'doc-summarise-entity', entityId: 'e2' });
	const running = q.start(async job => {
		order.push(`start:${job.kind === 'file' ? 'file' : (job as { entityId: string }).entityId}`);
		if (job.kind === 'file') await file.wait;
	});
	order.push('queued:file');
	q.enqueue({ kind: 'file', filePath: join(A, 'x.ts'), event: 'update' });   // before either lane resumes
	await until(() => order.includes('start:file'), 'the file job to start');
	await tick(); await tick();
	assert.deepEqual(order, ['start:e1', 'queued:file', 'start:file'], 'e1 was already in progress; e2 waits behind the code job');
	file.open();
	await until(() => order.includes('start:e2'), 'e2 to run');
	assert.deepEqual(order, ['start:e1', 'queued:file', 'start:file', 'start:e2']);
	q.stop();
	await running;
});

/**
 * Epic c2ba6fa6, Story s10, t6 -- the two summary-lane jobs. The doc-relations
 * and doc-relations-measure jobs go to the summary lane, never the index lane,
 * and cross a real SummaryRunner / SummaryWorkerLink to the document-summary
 * side; the doc-relations scheduler (on the subsystem pass's triggers) runs a
 * second pass after the first, re-arms its retry after a failed, rejected or
 * non-outcome run; a full index restores carried proposal rows before the pass
 * is requested; stop disposes the scheduler's timers.
 *
 * Run: npx tsx --test src/indexer/__tests__/doc-relations-jobs.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import { fileEntityHashInTxn, readDocRelationRowsInTxn, writeDocRelationRowInTxn } from '../../db/doc-relations.js';
import type { DbClient } from '../../db/client.js';
import type { IndexJob } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import { IndexingBlock, createIndexingBlock } from '../../daemon/threads/indexing-block.js';
import { isSummaryJob as linkIsSummaryJob, runIndexJob, SummaryRunner, SummaryWorkerLink } from '../../daemon/threads/summary-link.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { _forgetFullPassesForTest } from '../subsystem-pass.js';
import type { SchedulerClock, SubsystemsOutcome } from '../subsystem-scheduler.js';

useTemporaryLance();

class FakeClock implements SchedulerClock {
	t = 0;
	private seq = 0;
	private timers: { at: number; fn: () => void; id: number }[] = [];
	now(): number { return this.t; }
	setTimeout(fn: () => void, ms: number): unknown { const id = ++this.seq; this.timers.push({ at: this.t + ms, fn, id }); return id; }
	clearTimeout(handle: unknown): void { this.timers = this.timers.filter(x => x.id !== handle); }
	async advance(ms: number): Promise<void> {
		const end = this.t + ms;
		for (;;) {
			const due = this.timers.filter(x => x.at <= end).sort((a, b) => a.at - b.at)[0];
			if (due === undefined) break;
			this.t = due.at;
			this.timers = this.timers.filter(x => x !== due);
			due.fn();
			await settle();
		}
		this.t = end;
		await settle();
	}
}
const settle = () => new Promise(r => setTimeout(r, 60));
const until = async (what: string, ok: () => boolean): Promise<void> => {
	for (let i = 0; i < 200 && !ok(); i++) await settle();
	assert.ok(ok(), `timed out waiting for ${what}`);
};

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
const db = null as unknown as DbClient;
let clock: FakeClock;
/** Rows readable when each doc-relations pass started on this side (threads off). */
let rowsAtPassStart: number[];

class Owner extends IndexerService {
	protected override subsystemSchedulerClock() { return clock; }
	protected override docRelationsSchedulerClock() { return clock; }
	request(repoPath: string): Promise<void> { return this.enqueueSubsystemsIfComplete(repoPath); }
	protected override async docRelationsPass(repoPath: string): Promise<unknown> {
		const s = await getGraphStore();
		rowsAtPassStart.push(readDocRelationRowsInTxn(s, (await lookupRepoId(repoPath))!).size);
		return { summariesFailed: 0, stopped: false, startedAt: clock.now() } satisfies SubsystemsOutcome;
	}
}

let store: string;
let repo: string;
let queue: IndexQueue;
let owner: Owner;
let runner: SummaryRunner;
let link: SummaryWorkerLink;
let channel: MessageChannel;

test.beforeEach(async () => {
	await closeGraphStore();
	_forgetFullPassesForTest();
	clock = new FakeClock();
	rowsAtPassStart = [];
	store = mkdtempSync(join(tmpdir(), 'insrc-s10-t6-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s10-t6-repo-')));
	for (const [f, text] of Object.entries({ 'docs/a.md': '# A\nSee [b](b.md).\n', 'docs/b.md': '# B\nText.\n', 'src/x.ts': 'export function x(): void {}\n' })) {
		mkdirSync(dirname(join(repo, f)), { recursive: true });
		writeFileSync(join(repo, f), text);
	}
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'pending' });
	queue = new IndexQueue();
	owner = new Owner(db, queue, watcher, undefined, 20);
	channel = new MessageChannel();
	runner = new SummaryRunner(channel.port1, () => undefined, () => {});
	link = new SummaryWorkerLink(channel.port2, new IndexingBlock(createIndexingBlock()));
});
test.afterEach(async () => {
	owner.disposeSubsystemScheduler();
	queue.stop();
	runner.stop();
	channel.port1.close();
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

/** Index, then drive the queue as indexing-worker.ts does: summary-lane jobs cross the link to the summary side. */
async function startOwner(): Promise<void> {
	await owner.processJob({ kind: 'full', repoPath: repo });
	await owner.start([{ path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'ready' }]);
	void queue.start(async (job: IndexJob) => { await owner.runQueuedJob(job, () => runIndexJob(job, runner, j => owner.processJob(j))); });
}

test('s10 t6: doc-relations jobs route to the summary lane and the summary worker', async () => {
	const jobs: IndexJob[] = [{ kind: 'doc-relations', repoPath: repo }, { kind: 'doc-relations-measure', repoPath: repo, setHash: 'h' }];
	for (const job of jobs) assert.equal(linkIsSummaryJob(job), true, `${job.kind}: handed to the summary worker`);
	// On the queue: both land on the summary lane, and one of each is kept per repository.
	const q = new IndexQueue();
	for (const job of [...jobs, ...jobs]) q.enqueue(job);
	assert.deepEqual(q.laneStatus().index.depth, 0, 'never the index lane');
	assert.equal(q.laneStatus().summary.depth, 2, 'one queued doc-relations job and one measurement per repository');
	q.stop();

	// Across the link: the summary side receives both kinds and runs them.
	const served: IndexJob['kind'][] = [];
	link.serveJobs(async job => { served.push(job.kind); return job.kind === 'subsystems' || job.kind === 'doc-relations' ? { summariesFailed: 0, stopped: false, startedAt: clock.now() } : undefined; }, () => undefined);
	await startOwner();
	await until('the first doc-relations pass on the summary side', () => served.includes('doc-relations'));
	queue.enqueue({ kind: 'doc-relations-measure', repoPath: repo, setHash: 'h' });
	await until('the measurement on the summary side', () => served.includes('doc-relations-measure'));
	assert.deepEqual(rowsAtPassStart, [], 'the owner side ran neither: both crossed to the summary worker');
});

test('s10 t6: runQueuedJob lifecycle: second pass, failed-pass retry, abandoned reply', async () => {
	const starts: number[] = [];
	let result: 'clean' | 'fail' | 'throw' | 'unavailable' = 'clean';
	link.serveJobs(async job => {
		if (job.kind === 'subsystems') return { summariesFailed: 0, stopped: false, startedAt: clock.now() };
		if (job.kind !== 'doc-relations') return undefined;
		starts.push(clock.now());
		if (result === 'throw') throw new Error('the worker reply was abandoned');
		if (result === 'unavailable') return { unavailable: true, reason: 'claude is not signed in' };
		return { summariesFailed: result === 'fail' ? 1 : 0, stopped: false, startedAt: clock.now() } satisfies SubsystemsOutcome;
	}, () => undefined);
	await startOwner();
	await until('the first pass', () => starts.length === 1);

	// A second pass runs after the first (paced 60 s from its start).
	await owner.request(repo);
	await clock.advance(60_000);
	await until('the second pass', () => starts.length === 2);

	// A failed pass re-arms the retry; it runs after 60 s with no new request.
	result = 'fail';
	await clock.advance(60_000);
	await owner.request(repo);
	await until('the failing pass', () => starts.length === 3);
	await until('its retry armed', () => owner._docRelationsTimersForTest().retry === 1);
	await clock.advance(60_000);
	await until('the retry', () => starts.length === 4);

	// A rejected run (an abandoned reply) and a non-outcome (an unavailable provider) are failed passes too.
	for (const kind of ['throw', 'unavailable'] as const) {
		result = kind;
		await until(`retry armed before ${kind}`, () => owner._docRelationsTimersForTest().retry === 1);
		const n = starts.length;
		for (let k = 0; k < 40 && starts.length === n; k++) await clock.advance(60_000);   // until the retry fires once
		assert.equal(starts.length, n + 1, `the ${kind} pass ran`);
		await until(`a retry re-armed after ${kind}`, () => owner._docRelationsTimersForTest().retry === 1);
	}
	result = 'clean';
	const m = starts.length;
	for (let k = 0; k < 40 && starts.length === m; k++) await clock.advance(60_000);
	await until('a clean pass', () => starts.length === m + 1);
	await settle();
	assert.equal(owner._docRelationsTimersForTest().retry, 0, 'a clean pass arms no retry');
});

test('s10 t6: carried rows restored after a full index before the pass; stop disposes timers', async () => {
	// The summary side runs the doc-relations pass (the override records what it reads) and nothing else.
	link.serveJobs(async job => (job.kind === 'doc-relations' ? owner.processJob(job) : undefined), () => undefined);
	await owner.processJob({ kind: 'full', repoPath: repo });
	const s = await getGraphStore();
	const repoId = (await lookupRepoId(repo))!;
	await withWriteTxn(t => writeDocRelationRowInTxn(t, repoId, 'docs/a.md', {
		contentHash: fileEntityHashInTxn(s, repo, 'docs/a.md')!, modelId: 'm', computedAtGeneration: 1, proposals: [],
	}));
	await owner.start([{ path: repo, name: 'fixture', addedAt: '2026-11-04T00:00:00.000Z', status: 'ready' }]);
	void queue.start(async (job: IndexJob) => { await owner.runQueuedJob(job, () => runIndexJob(job, runner, j => owner.processJob(j))); });
	await until('the pass requested by the first full index', () => rowsAtPassStart.length === 1);

	await clock.advance(60_000);
	queue.enqueue({ kind: 'full', repoPath: repo });
	await until('the pass after the full index', () => rowsAtPassStart.length === 2);
	assert.equal(rowsAtPassStart.at(-1), 1, 'the carried row was written back before the pass started');

	// A failed pass arms a retry; stop disposes it, and the pacing timer.
	const failing = new (class extends Owner {
		protected override async docRelationsPass(): Promise<unknown> { return { unavailable: true }; }
	})(db, new IndexQueue(), watcher, undefined, 20);
	await failing.runQueuedJob({ kind: 'doc-relations', repoPath: repo }, () => failing.processJob({ kind: 'doc-relations', repoPath: repo }));
	assert.equal(failing._docRelationsTimersForTest().retry, 1, 'a non-outcome arms the retry');
	await failing.request(repo);
	failing.disposeSubsystemScheduler();
	assert.deepEqual(failing._docRelationsTimersForTest(), { pacing: 0, retry: 0 }, 'stop clears every timer');
});

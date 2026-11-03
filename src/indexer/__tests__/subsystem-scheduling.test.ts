/**
 * ISSUE-7d42b5dc S001 t4 -- one scheduling owner for the subsystem pass. The
 * IndexerService that owns the index queue (A) drives its real IndexQueue with
 * runQueuedJob + runIndexJob; subsystems jobs cross a real SummaryRunner /
 * SummaryWorkerLink over a MessageChannel to the document-summary side (B),
 * whose outcome rides back on the reply. A fake clock drives the scheduler's
 * time and timers, so the 60 s interval and the back-off are checked exactly
 * without sleeping.
 *
 * Run: npx tsx --test src/indexer/__tests__/subsystem-scheduling.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo } from '../../db/repos.js';
import { readSubsystems } from '../../db/subsystems.js';
import type { DbClient } from '../../db/client.js';
import type { IndexJob, LLMProvider } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import { IndexingBlock, createIndexingBlock } from '../../daemon/threads/indexing-block.js';
import { runIndexJob, SummaryRunner, SummaryWorkerLink } from '../../daemon/threads/summary-link.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { _forgetFullPassesForTest } from '../subsystem-pass.js';
import { SubsystemScheduler, type SchedulerClock, type SubsystemsOutcome } from '../subsystem-scheduler.js';

useTemporaryLance();

/** Time and timers the test moves by hand. */
class FakeClock implements SchedulerClock {
	t = 0;
	private seq = 0;
	private timers: { at: number; fn: () => void; id: number }[] = [];
	now(): number { return this.t; }
	setTimeout(fn: () => void, ms: number): unknown { const id = ++this.seq; this.timers.push({ at: this.t + ms, fn, id }); return id; }
	clearTimeout(handle: unknown): void { this.timers = this.timers.filter(x => x.id !== handle); }
	get armed(): number { return this.timers.length; }
	/** Move time forward by `ms`, firing each due timer at its own time and letting the work it starts settle. */
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

const FILES: Record<string, string> = {
	'src/parse/lexer.ts':  "import { token } from './tokens.js';\nexport function lex(s: string): string[] { return [token(s)]; }\n",
	'src/parse/tokens.ts': "export function token(s: string): string { return s; }\n",
	'src/store/rows.ts':   "import { lex } from '../parse/lexer.js';\nexport function row(s: string): string { return lex(s)[0]!; }\n",
	'src/store/limits.ts': "export function maxRows(): number { return 100; }\n",
};
const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
const db = null as unknown as DbClient;

let clock: FakeClock;
/** The queue-owning IndexerService (the code-indexing worker's), on the fake clock. */
class Owner extends IndexerService {
	protected override subsystemSchedulerClock() { return clock; }
	request(repoPath: string): Promise<void> { return this.enqueueSubsystemsIfComplete(repoPath); }
}

let store: string;
let repo: string;
let queue: IndexQueue;
let owner: Owner;
let runner: SummaryRunner;
let link: SummaryWorkerLink;
let channel: MessageChannel;
/** Held 'file' jobs keep the index lane busy (the summary lane then waits for code work). */
let laneGate: Promise<void> | undefined;

test.beforeEach(async () => {
	await closeGraphStore();
	_forgetFullPassesForTest();
	clock = new FakeClock();
	store = mkdtempSync(join(tmpdir(), 'insrc-7d42-sched-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-7d42-sched-repo-')));
	for (const [f, text] of Object.entries(FILES)) {
		mkdirSync(dirname(join(repo, f)), { recursive: true });
		writeFileSync(join(repo, f), text);
	}
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-03T00:00:00.000Z', status: 'pending' });
	queue = new IndexQueue();
	owner = new Owner(db, queue, watcher, undefined, 20);   // a short settle window: code work settles as in the daemon
	channel = new MessageChannel();
	runner = new SummaryRunner(channel.port1, () => undefined, () => {});
	link = new SummaryWorkerLink(channel.port2, new IndexingBlock(createIndexingBlock()));
	laneGate = undefined;
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

/** Index the repository (its full index requests the first pass), then start the queue driver as indexing-worker.ts does. */
async function startOwner(): Promise<void> {
	await owner.processJob({ kind: 'full', repoPath: repo });
	await owner.start([{ path: repo, name: 'fixture', addedAt: '2026-11-03T00:00:00.000Z', status: 'ready' }]);
	void queue.start(async (job: IndexJob) => {
		if (job.kind === 'file' && laneGate !== undefined) await laneGate;
		await owner.runQueuedJob(job, () => runIndexJob(job, runner, j => owner.processJob(j)));
	});
}
/** The summary side runs `run` for each subsystems job (it never enqueues: its queue is the link). */
function serveSubsystems(run: (job: IndexJob) => Promise<unknown>): void {
	link.serveJobs(job => (job.kind === 'subsystems' ? run(job) : Promise.resolve(undefined)), () => undefined);
}
function hold(): { gate: Promise<void>; release: () => void } {
	let release!: () => void;
	const gate = new Promise<void>(r => { release = r; });
	return { gate, release };
}

test('S001 t4: across the worker link, passes are paced by their actual starts, even when the lane or a held hand-over delays a start', async () => {
	const starts: number[] = [];
	let handOver: Promise<void> | undefined;
	serveSubsystems(async () => {
		if (handOver !== undefined) await handOver;          // a worker reconnection or a maintenance wait
		const startedAt = clock.now();
		starts.push(startedAt);
		return { summariesFailed: 0, stopped: false, startedAt } satisfies SubsystemsOutcome;
	});

	// The hand-over is held: the full index's pass is dispatched at t=0 but starts only at t=120 s.
	const h = hold();
	handOver = h.gate;
	await startOwner();
	await settle();
	assert.deepEqual(starts, [], 'held');
	await clock.advance(120_000);
	await owner.request(repo);                             // settles arrive while it is in flight: absorbed
	await owner.request(repo);
	h.release();
	handOver = undefined;
	await until('the first pass', () => starts.length === 1);
	assert.deepEqual(starts, [120_000], 'its actual start');

	// The next is queued only 60 s after that actual start, not 60 s after the hand-over.
	await clock.advance(59_999);
	assert.equal(starts.length, 1, 'no second pass while within the interval');
	await clock.advance(1);
	await until('the paced pass', () => starts.length === 2);
	assert.equal(starts[1], 180_000);

	// The summary lane is held by code work: a pass queued at t=300 s starts at t=400 s; the next one
	// requested then waits until t=460 s.
	const lane = hold();
	laneGate = lane.gate;
	queue.enqueue({ kind: 'file', filePath: join(repo, 'src/store/limits.ts'), event: 'update' });
	await settle();
	await clock.advance(120_000);
	await owner.request(repo);
	await clock.advance(100_000);
	assert.equal(starts.length, 2, 'the summary lane waits for code work');
	lane.release();
	laneGate = undefined;
	await until('the delayed pass', () => starts.length === 3);
	assert.equal(starts[2], 400_000);
	await owner.request(repo);
	await clock.advance(59_999);
	assert.equal(starts.length, 3);
	await clock.advance(1);
	await until('the next paced pass', () => starts.length === 4);

	for (let i = 1; i < starts.length; i++) assert.ok(starts[i]! - starts[i - 1]! >= 60_000, `starts ${i - 1} and ${i} are 60 s apart`);
});

test('S001 t4: failed summaries re-queue on the bounded back-off at the queue owner, a clean pass resets it, and a rejected job is retried', async () => {
	const starts: number[] = [];
	let result: 'fail' | 'clean' | 'stopped' | 'throw' = 'fail';
	serveSubsystems(async () => {
		starts.push(clock.now());
		if (result === 'throw') throw new Error('the summary side failed');
		return { summariesFailed: result === 'clean' ? 0 : 1, stopped: result === 'stopped', startedAt: clock.now() } satisfies SubsystemsOutcome;
	});
	await startOwner();
	await until('the first pass', () => starts.length === 1);

	// Failing passes: 60 s, 120 s, 240 s, ... capped at 30 min. Each retry fires exactly at its delay.
	const expected = [60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000, 1_800_000];
	for (const [i, gap] of expected.entries()) {
		await until(`retry ${i + 1} armed`, () => clock.armed === 1);
		const n = starts.length;
		await clock.advance(gap - 1);
		assert.equal(starts.length, n, `retry ${i + 1} not before ${gap} ms`);
		await clock.advance(1);
		await until(`retry ${i + 1}`, () => starts.length === n + 1);
	}
	const gaps = starts.slice(1).map((t, i) => t - starts[i]!);
	assert.deepEqual(gaps, expected);

	// A clean pass resets the back-off and arms nothing.
	result = 'clean';
	await until('the next retry armed', () => clock.armed === 1);
	await clock.advance(1_800_000);
	await until('the clean retry', () => starts.length === 9);
	await settle();
	assert.equal(clock.armed, 0, 'no retry after a clean pass');
	await clock.advance(4 * 60 * 60_000);
	assert.equal(starts.length, 9, 'and none fires later');

	// The next failure starts the back-off from 60 s again.
	result = 'fail';
	await owner.request(repo);
	await until('a failing pass', () => starts.length === 10);
	await until('its retry armed', () => clock.armed === 1);
	await clock.advance(60_000);
	await until('its retry after 60 s', () => starts.length === 11);

	// A stopped pass (shutdown or a new generation) is not a failure: nothing is armed for it.
	result = 'stopped';
	await until('the next retry armed', () => clock.armed === 1);
	await clock.advance(120_000);
	await until('the stopped pass', () => starts.length === 12);
	await settle();
	assert.equal(clock.armed, 0, 'a stopped pass arms no retry');

	// A job that fails without an outcome (the summary side threw) is retried.
	result = 'throw';
	await clock.advance(60_000);                           // past the pacing interval
	await owner.request(repo);
	await until('the throwing pass', () => starts.length === 13);
	await until('its retry armed', () => clock.armed === 1);
	result = 'clean';
	// The third failure in a row (the stopped pass did not reset the count): 240 s.
	await clock.advance(239_999);
	assert.equal(starts.length, 13);
	await clock.advance(1);
	await until('its retry', () => starts.length === 14);
});

test('S001 t4: after an outage a retry writes the summaries, one call at a time after code work', async () => {
	let down = true;
	let codeBusy = false;
	let active = 0, maxActive = 0, duringCode = 0, calls = 0;
	const provider = {
		capabilities: {},
		async completeStructured<T>(): Promise<T> {
			calls++;
			if (codeBusy) duringCode++;
			active++; maxActive = Math.max(maxActive, active);
			try {
				await new Promise(r => setTimeout(r, 10));
				if (down) throw new Error('the cheap tier is down');
				return { summary: 'a summary' } as T;
			} finally { active--; }
		},
	} as unknown as LLMProvider;
	// The summary side: a real IndexerService over the link, running the real pass with the injected provider.
	class SummarySide extends IndexerService {
		protected override subsystemProvider() { return provider; }
	}
	const side = new SummarySide(db, link, watcher, undefined, 600_000);
	// The real pass stamps its start with the real time: the fake clock starts there too.
	clock.t = Date.now();
	link.serveJobs(job => side.processJob(job), () => undefined);

	await startOwner();
	await until('the first pass to fail and arm its retry', () => clock.armed > 0);
	const empty = (await readSubsystems(repo)).subsystems.filter(s => s.summary === null).length;
	assert.ok(empty > 0, 'the outage left summaries empty');

	// The model is back; code work arrives just before the retry is due.
	down = false;
	const lane = hold();
	laneGate = lane.gate;
	codeBusy = true;
	queue.enqueue({ kind: 'file', filePath: join(repo, 'src/store/limits.ts'), event: 'update' });
	await settle();
	const before = calls;
	await clock.advance(60_000);
	assert.equal(calls, before, 'the retry waits for code work');
	codeBusy = false;
	lane.release();
	laneGate = undefined;
	await settle();
	// The retry fired while the queued code work made the graph incomplete: it was re-armed, not dropped.
	await until('the re-armed retry', () => clock.armed >= 1);
	await clock.advance(120_000);   // the re-armed retry, and any pacing for the real seconds that passed
	for (let i = 0; i < 200; i++) {
		if ((await readSubsystems(repo)).subsystems.every(x => x.summary !== null)) break;
		await settle();
	}
	assert.ok((await readSubsystems(repo)).subsystems.every(x => x.summary !== null), 'the retry wrote every summary');
	assert.equal(maxActive, 1, 'one model call at a time');
	assert.equal(duringCode, 0, 'no model call while code work was queued');

	// A retry that fires while the graph is incomplete, with no settle to follow (an unchanged file), is re-armed,
	// not dropped: the scheduler alone, with a host whose graph completes only later.
	const own = new FakeClock();
	let complete = true;
	const queued: string[] = [];
	const scheduler = new SubsystemScheduler({ graphComplete: async () => complete, enqueue: r => queued.push(r), isStopping: () => false, clock: own });
	await scheduler.request('/r');
	scheduler.started('/r');
	scheduler.finished('/r', { summariesFailed: 1, stopped: false, startedAt: own.now() });
	complete = false;
	await own.advance(60_000);
	assert.deepEqual(queued, ['/r'], 'not queued while incomplete');
	assert.equal(own.armed, 1, 're-armed');
	complete = true;
	await own.advance(60_000);
	assert.deepEqual(queued, ['/r', '/r'], 'the re-armed retry queues the pass once the graph is complete');
});

test('S001 t4: dispose clears the timers on both stop paths, and a timer firing while stopping queues nothing', async () => {
	const starts: number[] = [];
	serveSubsystems(async () => { starts.push(clock.now()); return { summariesFailed: 1, stopped: false, startedAt: clock.now() } satisfies SubsystemsOutcome; });
	await startOwner();
	await until('the first pass', () => starts.length === 1);
	await owner.request(repo);                            // within the interval: a pacing timer
	assert.ok(clock.armed >= 2, 'a retry and a pacing timer are armed');

	owner.disposeSubsystemScheduler();
	assert.equal(clock.armed, 0, 'dispose clears every timer');
	await owner.request(repo);
	await clock.advance(2 * 60 * 60_000);
	assert.equal(starts.length, 1, 'nothing is queued after dispose');

	// A request still reading the graph's state when dispose runs resumes into nothing: no job, no timer.
	const own = new FakeClock();
	let answer!: (complete: boolean) => void;
	const queued: string[] = [];
	const scheduler = new SubsystemScheduler({ graphComplete: () => new Promise<boolean>(r => { answer = r; }), enqueue: r => queued.push(r), isStopping: () => false, clock: own });
	const pending = scheduler.request('/r');
	scheduler.dispose();
	answer(true);
	await pending;
	assert.deepEqual([queued, own.armed], [[], 0], 'a request resuming after dispose queues nothing');

	// Both stop paths dispose the scheduler before the queue stops.
	for (const [file, path] of [['src/daemon/index.ts', /stopIndexing = \(\) => \{ indexerService\.disposeSubsystemScheduler\(\); indexQueue\.stop\(\);/],
	                            ['src/daemon/threads/indexing-worker.ts', /INDEXING_STOP_OP, async \(\) => \{\s*service\.disposeSubsystemScheduler\(\);\s*queue\.stop\(\);/]] as const) {
		assert.ok(path.test(readFileSync(join(process.cwd(), file), 'utf8')), `${file} disposes the scheduler on stop`);
	}
});

test('S001 t4: a timer that fires while the queue is stopping queues nothing', async () => {
	const starts: number[] = [];
	serveSubsystems(async () => { starts.push(clock.now()); return { summariesFailed: 1, stopped: false, startedAt: clock.now() } satisfies SubsystemsOutcome; });
	await startOwner();
	await until('the first pass', () => starts.length === 1);
	assert.ok(clock.armed >= 1, 'the retry is armed');
	const enqueued: IndexJob[] = [];
	const enqueue = queue.enqueue.bind(queue);
	queue.enqueue = (job: IndexJob) => { enqueued.push(job); enqueue(job); };
	queue.stop();
	await clock.advance(60 * 60_000);
	assert.deepEqual(enqueued.filter(j => j.kind === 'subsystems'), [], 'the retry fired while stopping and queued nothing');
});

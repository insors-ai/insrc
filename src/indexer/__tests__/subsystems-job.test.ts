/**
 * Epic c2ba6fa6, Story s8, t5 -- the subsystems job, queued and run in the
 * summary lane. The real IndexQueue and IndexerService over a temporary store:
 * the job is a summary-lane job, which waits for code work and is handed to the
 * summary worker; queued duplicates for one repository collapse to one; a full
 * index, a settle and a clean-up that leave the graph complete enqueue it, and
 * an incomplete graph does not; the job runs the subsystem pass.
 *
 * Run: npx tsx --test src/indexer/__tests__/subsystems-job.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo } from '../../db/repos.js';
import { markFullIndexUnfinished, readIndexState } from '../../db/index-state.js';
import type { DbClient } from '../../db/client.js';
import type { IndexJob } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import { runIndexJob, type SummaryRunner } from '../../daemon/threads/summary-link.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';

useTemporaryLance();

const FILES: Record<string, string> = {
	'src/a/x.ts': "import { y } from './y.js';\nexport function x(): string { return y(); }\n",
	'src/a/y.ts': "export function y(): string { return 'y'; }\n",
};
const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;
const db = null as unknown as DbClient;

/** A queue that records what is enqueued (and still queues it). */
class RecordingQueue extends IndexQueue {
	readonly enqueued: IndexJob[] = [];
	override enqueue(job: IndexJob): void { this.enqueued.push(job); super.enqueue(job); }
}

/** The indexer with a short settle window, the clean-up's resolver work exposed, and a pass that runs no model. */
class Svc extends IndexerService {
	readonly passes: string[] = [];
	constructor(readonly q: RecordingQueue) { super(db, q, watcher, undefined, 20); }
	cleanUpPass(repoPath: string): Promise<void> { return this.resolveAfterReconcile(repoPath); }
	protected override async subsystemPass(repoPath: string): Promise<void> { this.passes.push(repoPath); }
}

let store: string;
let repo: string;
test.beforeEach(async () => {
	await closeGraphStore();
	store = mkdtempSync(join(tmpdir(), 'insrc-s8-job-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-s8-job-repo-')));
	for (const [f, text] of Object.entries(FILES)) {
		mkdirSync(dirname(join(repo, f)), { recursive: true });
		writeFileSync(join(repo, f), text);
	}
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-11-02T00:00:00.000Z', status: 'pending' });
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

const subsystemJobs = (q: RecordingQueue) => q.enqueued.filter(j => j.kind === 'subsystems');
const tick = () => new Promise<void>(r => setImmediate(r));

test('s8 t5: the subsystems job runs in the summary lane, after code work, and is handed to the summary worker', async () => {
	const q = new IndexQueue();
	q.enqueue({ kind: 'file', filePath: '/r/a.ts', event: 'update' });
	q.enqueue({ kind: 'subsystems', repoPath: '/r' });
	assert.deepEqual(q.laneStatus(), { index: { depth: 1, running: false }, summary: { depth: 1, running: false }, backfill: { depth: 0, running: false } });

	const order: string[] = [];
	let indexRunning = false, overlapped = false;
	const running = q.start(async job => {
		if (job.kind === 'file') indexRunning = true;
		if (job.kind === 'subsystems' && indexRunning) overlapped = true;
		order.push(job.kind);
		await tick(); await tick();
		if (job.kind === 'file') indexRunning = false;
	});
	for (let i = 0; i < 500 && order.length < 2; i++) await tick();
	q.stop();
	await running;
	assert.deepEqual(order, ['file', 'subsystems']);
	assert.equal(overlapped, false, 'the summary lane starts only while the index lane is idle');

	// On the code-indexing worker, a summary-lane job goes to the summary worker, not the local processor.
	const handed: IndexJob[] = [];
	const runner = { run: async (job: IndexJob) => { handed.push(job); } } as unknown as SummaryRunner;
	await runIndexJob({ kind: 'subsystems', repoPath: '/r' }, runner, async () => { throw new Error('ran on the code-indexing worker'); });
	assert.deepEqual(handed, [{ kind: 'subsystems', repoPath: '/r' }]);
});

test('s8 t5: queued subsystems jobs for one repository collapse to one', () => {
	const q = new IndexQueue();
	q.enqueue({ kind: 'subsystems', repoPath: '/r' });
	q.enqueue({ kind: 'subsystems', repoPath: '/r' });
	q.enqueue({ kind: 'subsystems', repoPath: '/other' });
	assert.equal(q.laneStatus().summary.depth, 2);
});

test('s8 t5: a full index that leaves the graph complete enqueues one subsystems job; an incomplete one enqueues none; the job runs the pass', async () => {
	const svc = new Svc(new RecordingQueue());
	await svc.processJob({ kind: 'full', repoPath: repo });
	assert.equal((await readIndexState(repo))?.graphComplete, true);
	assert.deepEqual(subsystemJobs(svc.q), [{ kind: 'subsystems', repoPath: repo }]);

	await svc.processJob({ kind: 'subsystems', repoPath: repo });
	assert.deepEqual(svc.passes, [repo], 'the job runs the subsystem pass');

	// A file that cannot be read leaves the next full index incomplete.
	const locked = join(repo, 'src/a/locked.ts');
	writeFileSync(locked, 'export const z = 1;\n');
	chmodSync(locked, 0o000);
	try {
		const svc2 = new Svc(new RecordingQueue());
		await svc2.processJob({ kind: 'full', repoPath: repo });
		assert.equal((await readIndexState(repo))?.graphComplete, false);
		assert.deepEqual(subsystemJobs(svc2.q), []);
	} finally {
		chmodSync(locked, 0o644);
	}
});

test('s8 t5: a settle and a clean-up that leave the graph complete enqueue the job; an incomplete graph does not', async () => {
	const svc = new Svc(new RecordingQueue());
	await svc.processJob({ kind: 'full', repoPath: repo });
	await svc.start([{ path: repo, name: 'fixture', addedAt: '2026-11-02T00:00:00.000Z', status: 'ready' }]);
	svc.q.enqueued.length = 0;

	writeFileSync(join(repo, 'src/a/z.ts'), "import { y } from './y.js';\nexport function z(): string { return y(); }\n");
	await svc.processJob({ kind: 'file', filePath: join(repo, 'src/a/z.ts'), event: 'add' });
	for (let i = 0; i < 300 && subsystemJobs(svc.q).length === 0; i++) await new Promise(r => setTimeout(r, 10));
	await svc._settlePassesDoneForTest();
	assert.deepEqual(subsystemJobs(svc.q), [{ kind: 'subsystems', repoPath: repo }], 'the settle enqueued it');

	svc.q.enqueued.length = 0;
	await svc.cleanUpPass(repo);
	assert.deepEqual(subsystemJobs(svc.q), [{ kind: 'subsystems', repoPath: repo }], 'the clean-up enqueued it');

	svc.q.enqueued.length = 0;
	await markFullIndexUnfinished(repo);
	await svc.cleanUpPass(repo);
	assert.deepEqual(subsystemJobs(svc.q), [], 'not on an incomplete graph');
});

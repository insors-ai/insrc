/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Story b94cf2c9 S001/t3 — the indexer owns the running summary sweep's
 * progress: it is set while docSummariseRepo runs and cleared when the sweep
 * completes, stops or throws.
 *
 * Over a temporary graph store; the summary step is overridden, so no model runs.
 *
 * Run: npx tsx --test src/indexer/__tests__/summary-sweep-progress.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { useTemporaryLance } from '../../db/lance/__tests__/helpers/temp-lance.js';
import { upsertEntities } from '../../db/entities.js';
import { addRepo, lookupRepoId } from '../../db/repos.js';
import type { DbClient } from '../../db/client.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { SummariseDocResult } from '../../analyze/summariser/index.js';
import type { Entity } from '../../shared/types.js';
import type { Watcher } from '../watcher.js';
import { makeEntityId } from '../parser/base.js';
import { IndexerService } from '../index.js';

useTemporaryLance();

let dir: string;
let repo: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-sweep-progress-store-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
	repo = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-sweep-progress-repo-')));
	await addRepo(null, { path: repo, name: 'fixture', addedAt: '2026-10-17T00:00:00.000Z', status: 'ready' });
	const repoId = (await lookupRepoId(repo))!;
	const file = join(repo, 'docs', 'a.md');
	const docs: Entity[] = ['one', 'two'].map(name => ({
		id: makeEntityId(repo, file, 'section', name), kind: 'section', name, language: 'markdown', repoId, repo, file,
		startLine: 1, endLine: 2, body: `# ${name}\n\ntext`, embedding: [], indexedAt: '2026-10-17T00:00:00.000Z',
	}));
	await upsertEntities(null, docs);
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

const watcher = { onEvents() {}, async addRepo() {}, async removeRepo() {}, async addConfigDir() {} } as unknown as Watcher;

type Progress = ReturnType<IndexerService['summarySweepProgress']>;

/** An indexer whose summary step records the progress it sees, then runs `step`. */
class Probe extends IndexerService {
	readonly seen: Progress[] = [];
	readonly order: string[] = [];
	constructor(queue: IndexQueue, private readonly step: () => Promise<void> = async () => {}) {
		super(null as unknown as DbClient, queue, watcher, undefined, 600_000);
	}
	protected override async summariseEntity(_entity: Entity): Promise<SummariseDocResult> {
		this.seen.push(this.summarySweepProgress());
		this.order.push(_entity.name);
		await this.step();
		return { ok: true };
	}
}

const sweep = (svc: IndexerService): Promise<void> => svc.processJob({ kind: 'doc-summarise-repo', repoPath: repo });

test('summarySweepProgress is set while docSummariseRepo runs and cleared when the sweep completes', async () => {
	const svc = new Probe(new IndexQueue());
	assert.equal(svc.summarySweepProgress(), undefined);
	await sweep(svc);
	assert.deepEqual(svc.seen, [{ repoPath: repo, done: 0, total: 2 }, { repoPath: repo, done: 1, total: 2 }]);
	assert.equal(svc.summarySweepProgress(), undefined, 'cleared once complete');
});

test('summarySweepProgress is cleared when the sweep stops on shutdown', async () => {
	const queue = new IndexQueue();
	const svc = new Probe(queue, async () => { queue.stop(); });
	await sweep(svc);
	assert.equal(svc.seen.length, 1, 'the sweep stopped after the summary in progress');
	assert.equal(svc.summarySweepProgress(), undefined, 'cleared once stopped');
});

test('summarySweepProgress is cleared when the sweep throws', async () => {
	class FailingQueue extends IndexQueue {
		calls = 0;
		override takeDocSummaryEdit(): ReturnType<IndexQueue['takeDocSummaryEdit']> {
			if (++this.calls === 2) throw new Error('queue failed');
			return undefined;
		}
	}
	const svc = new Probe(new FailingQueue());
	await assert.rejects(sweep(svc), /queue failed/);
	assert.equal(svc.seen.length, 1);
	assert.equal(svc.summarySweepProgress(), undefined, 'cleared once the sweep threw');
});

test('a single-document job queued for the summary lane is taken by the running sweep and summarised before the next document', async () => {
	const queue = new IndexQueue();
	const svc = new Probe(queue);
	queue.enqueue({ kind: 'doc-summarise-entity', entityId: makeEntityId(repo, join(repo, 'docs', 'a.md'), 'section', 'two') });
	await sweep(svc);
	assert.deepEqual(svc.order, ['two', 'one', 'two'], 'the edit ran first, then the sweep in order');
	assert.equal(queue.depth, 0, 'the sweep took the job off the queue');
});

test("the indexer's sweep pauses while the queue's index lane has work and continues when it is idle", async () => {
	const queue = new IndexQueue();
	const file = gate();
	const running = queue.start(async job => { if (job.kind === 'file') await file.wait; });
	queue.enqueue({ kind: 'file', filePath: join(repo, 'src', 'x.ts'), event: 'update' });
	await until(() => queue.laneStatus().index.running, 'the file job to start');
	const svc = new Probe(queue);
	const swept = sweep(svc);
	await tick(); await tick();
	assert.deepEqual(svc.order, [], 'no document is summarised while code work runs');
	file.open();
	await swept;
	assert.deepEqual(svc.order, ['one', 'two'], 'the sweep continued once code work was done');
	queue.stop();
	await running;
});

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

test('a summary never starts while code work is queued, even when the sweep wakes from its wait just before a code job arrives', async () => {
	// The raced state: the sweep's first wait resolves although a code job is running.
	class RacedQueue extends IndexQueue {
		raced = false;
		override waitForIndexIdle(): Promise<void> {
			if (!this.raced) { this.raced = true; return Promise.resolve(); }
			return super.waitForIndexIdle();
		}
	}
	const queue = new RacedQueue();
	const file = gate();
	const running = queue.start(async job => { if (job.kind === 'file') await file.wait; });
	queue.enqueue({ kind: 'file', filePath: join(repo, 'src', 'x.ts'), event: 'update' });
	await until(() => queue.laneStatus().index.running, 'the file job to start');
	const svc = new Probe(queue);
	const swept = sweep(svc);
	for (let i = 0; i < 20; i++) await tick();
	assert.equal(queue.raced, true, 'the sweep woke from the raced wait');
	assert.deepEqual(svc.order, [], 'no summary started while the code job runs');
	file.open();
	await swept;
	assert.deepEqual(svc.order, ['one', 'two']);
	queue.stop();
	await running;
});

test("an edited document queued while the indexer's sweep is paused for code work runs before the sweep's next document", async () => {
	const queue = new IndexQueue();
	const file = gate();
	const running = queue.start(async job => { if (job.kind === 'file') await file.wait; });
	queue.enqueue({ kind: 'file', filePath: join(repo, 'src', 'x.ts'), event: 'update' });
	await until(() => queue.laneStatus().index.running, 'the file job to start');
	const svc = new Probe(queue);
	const swept = sweep(svc);
	for (let i = 0; i < 20; i++) await tick();
	// Queued directly in the lane the sweep takes edits from (the running queue's own
	// summary lane is held behind the file job too, so the sweep takes it first).
	queue.enqueue({ kind: 'doc-summarise-entity', entityId: makeEntityId(repo, join(repo, 'docs', 'a.md'), 'section', 'two') });
	file.open();
	await swept;
	assert.deepEqual(svc.order, ['two', 'one', 'two'], 'the edit ran first once code work was done');
	queue.stop();
	await running;
});

test('a single-document summary waits out code work that arrives while its document is read, and is not started on shutdown', async () => {
	const queue = new IndexQueue();
	const file = gate();
	const running = queue.start(async job => { if (job.kind === 'file') await file.wait; });
	queue.enqueue({ kind: 'file', filePath: join(repo, 'src', 'x.ts'), event: 'update' });
	await until(() => queue.laneStatus().index.running, 'the file job to start');
	const svc = new Probe(queue);
	const id = makeEntityId(repo, join(repo, 'docs', 'a.md'), 'section', 'one');
	const edit = svc.processJob({ kind: 'doc-summarise-entity', entityId: id });
	for (let i = 0; i < 20; i++) await tick();
	assert.deepEqual(svc.order, [], 'not while code work runs');
	queue.stop();
	await edit;
	assert.deepEqual(svc.order, [], 'not started on shutdown');
	file.open();
	await running;
});

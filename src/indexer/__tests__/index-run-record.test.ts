/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6, Story s5, Task t6 -- a full index keeps an in-process
 * record of how far it has got, and writes the run's final figures onto
 * the registry row once, with its final status.
 *
 * The full index runs for real over a small temporary repository and
 * temporary stores. Only the per-file step is a stand-in, so a test can
 * hold the walk on a file (to read the record mid-run) or fail it; that
 * step embeds through a model, which tests do not reach.
 *
 * Run: npx tsx --test src/indexer/__tests__/index-run-record.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, setGraphStorePath } from '../../db/graph/store.js';
import { closeLanceConn, setLanceConnPath } from '../../db/lance/conn.js';
import { _resetEntityVecCache } from '../../db/lance/entity-vec.js';
import { addRepo, listRepos } from '../../db/repos.js';
import type { DbClient } from '../../db/client.js';
import type { IndexJob, RegisteredRepo, RepoLastRun } from '../../shared/types.js';
import { IndexQueue } from '../../daemon/queue.js';
import type { Watcher } from '../watcher.js';
import { IndexerService } from '../index.js';
import { readIndexRun } from '../run-record.js';

const NOW = '2026-10-13T00:00:00.000Z';
const db = null as unknown as DbClient;
const FILES = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'];

let store: string;
let repo: string;

test.beforeEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	store = mkdtempSync(join(tmpdir(), 'insrc-s5t6-store-'));
	setGraphStorePath(join(store, 'graph.lmdb'));
	setLanceConnPath(join(store, 'lance'));
	repo = mkdtempSync(join(tmpdir(), 'insrc-s5t6-repo-'));
	mkdirSync(join(repo, 'src'), { recursive: true });
	for (const f of FILES) writeFileSync(join(repo, 'src', f), `export const ${f[0]} = 1;\n`, 'utf8');
});
test.afterEach(async () => {
	await closeGraphStore();
	await closeLanceConn();
	_resetEntityVecCache();
	rmSync(store, { recursive: true, force: true });
	rmSync(repo, { recursive: true, force: true });
});

function standInWatcher(): Watcher {
	return {
		onEvents() { /* no events */ },
		async addRepo() { /* not watching */ },
		async removeRepo() { /* not watching */ },
		async addConfigDir() { /* not watching */ },
	} as unknown as Watcher;
}

/** A deferred: a promise and its resolver. */
function gate(): { wait: Promise<void>; open: () => void } {
	let open!: () => void;
	const wait = new Promise<void>(r => { open = r; });
	return { wait, open };
}

/** The real full index, with a stand-in per-file step and the status writes counted. */
class ProbeService extends IndexerService {
	statusWrites: Array<{ status: string; lastRun?: RepoLastRun | undefined }> = [];
	filesSeen = 0;
	/** Hold the walk when this many files have been finished. */
	holdAfter: number | null = null;
	held = gate();
	reached = gate();

	protected override async indexFile(): Promise<boolean> {
		this.filesSeen += 1;
		if (this.holdAfter !== null && this.filesSeen === this.holdAfter + 1) {
			this.reached.open();
			await this.held.wait;
		}
		return true;
	}
	protected override async writeIndexStatus(
		repoPath: string, status: RegisteredRepo['status'], lastIndexed?: string, errorMsg?: string, lastRun?: RepoLastRun,
	): Promise<void> {
		this.statusWrites.push({ status, lastRun });
		await super.writeIndexStatus(repoPath, status, lastIndexed, errorMsg, lastRun);
	}
}

function service(): ProbeService {
	return new ProbeService(db, new IndexQueue(), standInWatcher(), undefined, 600_000);
}

async function rowOf(path: string): Promise<RegisteredRepo | undefined> {
	return (await listRepos(null)).find(r => r.path === path);
}

test("full index: during a run the in-process record shows began and files done of selected; at the end the registry row's lastRun is written once with outcome 'completed' or 'failed' (a forced failure mid-walk), and the record is closed; no write per file (counted)", async () => {
	await addRepo(null, { path: repo, name: '', addedAt: NOW, status: 'pending' });

	// (a) Held mid-walk after two files.
	const svc = service();
	svc.holdAfter = 2;
	const before = Date.now();
	const run = svc.processJob({ kind: 'full', repoPath: repo });
	await svc.reached.wait;
	const mid = readIndexRun(repo);
	assert.ok(mid !== undefined, 'the record is open while the index runs');
	assert.ok(mid.startedAt >= before && mid.startedAt <= Date.now(), 'began at the run start');
	assert.equal(mid.filesSelected, FILES.length, 'files selected, once counted');
	assert.equal(mid.filesDone, 2, 'files done so far');
	assert.equal((await rowOf(repo))?.status, 'indexing');
	svc.held.open();
	await run;

	assert.equal(readIndexRun(repo), undefined, 'the record is closed');
	const done = await rowOf(repo);
	assert.equal(done?.status, 'ready');
	assert.equal(done?.lastRun?.outcome, 'completed');
	assert.equal(done?.lastRun?.filesSelected, FILES.length);
	assert.equal(done?.lastRun?.filesDone, FILES.length);
	assert.equal(done?.lastRun?.startedAt, mid.startedAt);
	assert.ok((done?.lastRun?.endedAt ?? 0) >= mid.startedAt);
	// Two status writes for five files: 'indexing' at the start, the final one with lastRun.
	assert.deepEqual(svc.statusWrites.map(w => w.status), ['indexing', 'ready']);
	assert.equal(svc.statusWrites.filter(w => w.lastRun !== undefined).length, 1, 'lastRun written once');

	// (b) A forced failure. A file's own error is caught and the file skipped,
	// so a run fails at a step that is not per file; here the manifest step,
	// which runs once the walk has finished every file.
	const failing = service();
	(failing as unknown as { indexManifest: () => Promise<void> }).indexManifest = async () => {
		throw new Error('manifest read failed');
	};
	await assert.rejects(failing.processJob({ kind: 'full', repoPath: repo }), /manifest read failed/);
	assert.equal(readIndexRun(repo), undefined, 'the record is closed after a failure too');
	const failed = await rowOf(repo);
	assert.equal(failed?.status, 'error');
	assert.equal(failed?.lastRun?.outcome, 'failed');
	assert.equal(failed?.lastRun?.error, 'manifest read failed');
	assert.equal(failed?.lastRun?.filesSelected, FILES.length, 'how far it got: selected');
	assert.equal(failed?.lastRun?.filesDone, FILES.length, 'how far it got: done');
	assert.deepEqual(failing.statusWrites.map(w => w.status), ['indexing', 'error']);

	// (c) The count of status writes does not grow with the number of files.
	for (let i = 0; i < 20; i++) writeFileSync(join(repo, 'src', `more${i}.ts`), 'export const x = 1;\n', 'utf8');
	const larger = service();
	await larger.processJob({ kind: 'full', repoPath: repo });
	assert.equal((await rowOf(repo))?.lastRun?.filesDone, FILES.length + 20);
	assert.equal(larger.statusWrites.length, 2, '25 files, still two status writes');
});

test("reindex of a ready repository: status indexing and the running record carries the new run's figures", async () => {
	const earlier: RepoLastRun = { startedAt: 1_700_000_000_000, endedAt: 1_700_000_100_000, filesSelected: 3, filesDone: 3, outcome: 'completed' };
	await addRepo(null, { path: repo, name: '', addedAt: NOW, status: 'ready', lastIndexed: NOW });
	const { updateRepoStatus } = await import('../../db/repos.js');
	await updateRepoStatus(null, repo, 'ready', NOW, undefined, earlier);

	// repo.reindex (src/daemon/index.ts) enqueues exactly this job; the queue then runs it.
	const job: IndexJob = { kind: 'full', repoPath: repo };
	const svc = service();
	svc.holdAfter = 1;
	const run = svc.processJob(job);
	await svc.reached.wait;
	const row = await rowOf(repo);
	assert.equal(row?.status, 'indexing', 'once the queued full index has started');
	const view = readIndexRun(repo);
	assert.ok(view !== undefined);
	assert.ok(view.startedAt > earlier.endedAt, 'the new run, not the earlier one');
	assert.equal(view.filesSelected, FILES.length);
	assert.equal(view.filesDone, 1);
	assert.deepEqual(row?.lastRun, earlier, 'the earlier run stays on the row until this one ends');
	svc.held.open();
	await run;
	assert.equal((await rowOf(repo))?.lastRun?.startedAt, view.startedAt);
});

test('start-up re-queue: repositories left indexing without lastIndexed are still re-queued, unchanged', async () => {
	const dirs = ['pending', 'error', 'indexing-never', 'indexing-before', 'ready'].map(n => {
		const d = mkdtempSync(join(tmpdir(), `insrc-s5t6-${n}-`));
		return { n, d };
	});
	try {
		const repos: RegisteredRepo[] = [
			{ path: dirs[0]!.d, name: '', addedAt: NOW, status: 'pending' },
			{ path: dirs[1]!.d, name: '', addedAt: NOW, status: 'error', errorMsg: 'x' },
			{ path: dirs[2]!.d, name: '', addedAt: NOW, status: 'indexing' },
			{ path: dirs[3]!.d, name: '', addedAt: NOW, status: 'indexing', lastIndexed: NOW },
			{ path: dirs[4]!.d, name: '', addedAt: NOW, status: 'ready', lastIndexed: NOW },
		];
		for (const r of repos) await addRepo(null, r);
		const jobs: IndexJob[] = [];
		class RecordingQueue extends IndexQueue {
			override enqueue(j: IndexJob): void { jobs.push(j); }
		}
		const svc = new IndexerService(db, new RecordingQueue(), standInWatcher(), undefined, 600_000);
		await svc.start(repos);
		const full = jobs.filter(j => j.kind === 'full').map(j => (j as { repoPath: string }).repoPath).sort();
		assert.deepEqual(full, [dirs[0]!.d, dirs[1]!.d, dirs[2]!.d].sort(),
			"pending, error, and 'indexing' without lastIndexed are re-queued; 'indexing' with lastIndexed and 'ready' are not");
	} finally {
		for (const { d } of dirs) rmSync(d, { recursive: true, force: true });
	}
});

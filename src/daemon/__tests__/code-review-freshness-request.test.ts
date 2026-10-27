/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * codeReview.freshness requests indexing of the stale files it finds (Epic fa396bdf197b8e8b, Story s1, t4):
 * the handler built by buildHandlerRuntime, with a recording queue, a real store in a temporary home and
 * the real selection seam.
 *
 * Run: npx tsx --test src/daemon/__tests__/code-review-freshness-request.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-freshness-request-'));
process.env['HOME'] = HOME;

const { closeGraphStore, declareLiveStoreOwner } = await import('../../db/graph/store.js');
const { closeLanceConn } = await import('../../db/lance/conn.js');
const { getDb } = await import('../../db/client.js');
const { addRepo } = await import('../../db/repos.js');
const { buildHandlerRuntime } = await import('../handler-runtime.js');
const { realFreshnessGraphDeps } = await import('../../workflow/code-review/freshness.js');

const REPO = mkdtempSync(join(tmpdir(), 'insrc-freshness-repo-'));
const T = 'src/daemon/__tests__/code-review-freshness-request.test.ts';

interface Job { kind: string; filePath: string; event: string }
/** A queue that records what is enqueued; `work` is what it reports for the repo and may change between calls. */
function recordingQueue(work: () => { inFlight: boolean; pending: number }) {
	const jobs: Job[] = [];
	return {
		jobs,
		enqueue: (job: Job) => { jobs.push(job); },
		codeIndexWorkFor: () => work(),
	};
}

async function handlerWith(queue: ReturnType<typeof recordingQueue>) {
	const runtime = buildHandlerRuntime({
		db: await getDb(), configStore: {} as never, queue: queue as never, indexer: {} as never, startedAt: Date.now(),
		shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined,
	});
	const handler = runtime.rpcHandlers['codeReview.freshness']!;
	return (changedFiles: string[]) => handler({ repo: REPO, epicHash: 'e', storyId: 's1', changedFiles }) as Promise<{
		isProcessing: boolean; inFlight: boolean; pendingCodeIndexJobs: number; staleFiles: string[]; unindexedFiles: string[];
	}>;
}

before(async () => {
	declareLiveStoreOwner();
	await addRepo(await getDb(), { path: REPO, name: 'freshness-request', addedAt: '2026-10-27T00:00:00.000Z', status: 'ready' });
	mkdirSync(join(REPO, 'src'), { recursive: true });
	writeFileSync(join(REPO, 'src', 'a.ts'), 'export const a = 1;\n');
	writeFileSync(join(REPO, 'src', 'b.ts'), 'export const b = 1;\n');
});
after(async () => {
	await closeGraphStore();
	await closeLanceConn();
	rmSync(HOME, { recursive: true, force: true });
	rmSync(REPO, { recursive: true, force: true });
});

test(`${T}: the codeReview.freshness handler built by buildHandlerRuntime with a recording queue queues one 'file' job for each file in unindexedFiles, queues nothing for a second identical poll, and queues again after the file's mtime moves`, async () => {
	const queue = recordingQueue(() => ({ inFlight: false, pending: 0 }));
	const poll = await handlerWith(queue);
	const first = await poll(['src/a.ts', 'src/b.ts']);
	assert.deepEqual(first.unindexedFiles, ['src/a.ts', 'src/b.ts']);
	assert.deepEqual(queue.jobs, [
		{ kind: 'file', filePath: join(REPO, 'src', 'a.ts'), event: 'update' },
		{ kind: 'file', filePath: join(REPO, 'src', 'b.ts'), event: 'update' },
	]);

	const second = await poll(['src/a.ts', 'src/b.ts']);
	assert.deepEqual(second.staleFiles, ['src/a.ts', 'src/b.ts'], 'still stale, the graph holds nothing for them');
	assert.deepEqual(second.unindexedFiles, [], 'not listed again');
	assert.equal(queue.jobs.length, 2, 'nothing queued for the identical poll');

	const later = new Date(Date.now() + 60_000);
	utimesSync(join(REPO, 'src', 'a.ts'), later, later);       // the file is edited after its request
	const third = await poll(['src/a.ts', 'src/b.ts']);
	assert.deepEqual(third.unindexedFiles, ['src/a.ts']);
	assert.equal(queue.jobs.length, 3);
	assert.equal(queue.jobs[2]!.filePath, join(REPO, 'src', 'a.ts'));
});

test(`${T}: after queueing, the same reply carries isProcessing, inFlight and pendingCodeIndexJobs read from the queue after the jobs were queued`, async () => {
	const probe = join(REPO, 'src', 'c.ts');
	writeFileSync(probe, 'export const c = 1;\n');
	let queued = 0;
	const queue = recordingQueue(() => ({ inFlight: false, pending: queued }));
	const enqueue = queue.enqueue;
	queue.enqueue = (job: Job) => { enqueue(job); queued++; };
	const poll = await handlerWith(queue);
	const reply = await poll(['src/c.ts']);
	assert.deepEqual(reply.unindexedFiles, ['src/c.ts']);
	assert.equal(reply.pendingCodeIndexJobs, 1, 'read after the job was queued, not before');
	assert.equal(reply.isProcessing, true);
	assert.equal(reply.inFlight, false);
});

test(`${T}: realFreshnessGraphDeps().selection, with the indexer's parsers registered, returns 'not-code' for a .png file and package-lock.json, 'excluded-by-ignore' for a .ts file under node_modules, and 'selected' for a .ts file and a small .md file in a real temporary directory`, async () => {
	const { selection } = await realFreshnessGraphDeps();
	mkdirSync(join(REPO, 'node_modules', 'pkg'), { recursive: true });
	writeFileSync(join(REPO, 'logo.png'), 'x');
	writeFileSync(join(REPO, 'package-lock.json'), '{}');
	writeFileSync(join(REPO, 'node_modules', 'pkg', 'index.ts'), 'export {};\n');
	writeFileSync(join(REPO, 'README.md'), '# small\n');
	assert.equal(await selection(REPO, 'logo.png'), 'not-code');
	assert.equal(await selection(REPO, 'package-lock.json'), 'not-code');
	assert.equal(await selection(REPO, 'node_modules/pkg/index.ts'), 'excluded-by-ignore');
	assert.equal(await selection(REPO, 'src/a.ts'), 'selected');
	assert.equal(await selection(REPO, 'README.md'), 'selected');
});

test(`${T}: through the real seams, a changed .ts path that does not exist is not stale and queues nothing, while an existing entity-less .ts file is stale and queued once`, async () => {
	const queue = recordingQueue(() => ({ inFlight: false, pending: 0 }));
	const poll = await handlerWith(queue);
	const missing = await poll(['src/gone.ts']);
	assert.deepEqual(missing.staleFiles, []);
	assert.deepEqual(missing.unindexedFiles, []);
	assert.deepEqual(queue.jobs, []);

	writeFileSync(join(REPO, 'src', 'fresh-entityless.ts'), 'export const z = 1;\n');
	const present = await poll(['src/fresh-entityless.ts']);
	assert.deepEqual(present.staleFiles, ['src/fresh-entityless.ts']);
	await poll(['src/fresh-entityless.ts']);
	assert.equal(queue.jobs.length, 1, 'queued once across two polls');
});

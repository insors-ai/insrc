/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The document-summary worker (Epic 86197ac6, Story s2, t13): with the queue's
 * two lanes split across the code-indexing and summary workers, a summary
 * starts only while code indexing is idle, and the jobs and results are those
 * of the single-thread queue for the same input. Summaries use a stub that
 * needs no model (INSRC_TEST_STUB_SUMMARISER=1).
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/summary-worker.test.ts
 */

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MessageChannel } from 'node:worker_threads';
import type { MessagePort, Worker } from 'node:worker_threads';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-summary-worker-'));
process.env['HOME'] = HOME;
process.env['INSRC_TEST_STUB_SUMMARISER'] = '1';

const { closeGraphStore, declareLiveStoreOwner } = await import('../../../db/graph/store.js');
const { closeLanceConn } = await import('../../../db/lance/conn.js');
const { getDb, initDb } = await import('../../../db/client.js');
const { addRepo } = await import('../../../db/repos.js');
const { getEntity } = await import('../../../db/entities.js');
const { directDispatch } = await import('../../server.js');
const { IndexQueue } = await import('../../queue.js');
const { IndexerService } = await import('../../../indexer/index.js');
const { Watcher } = await import('../../../indexer/watcher.js');
const { ThreadServices } = await import('../main-services.js');
const { methodClasses } = await import('../method-class.js');
const { Router } = await import('../router.js');
const { startClassWorker, startWorker } = await import('../workers.js');
const { IndexingBlock } = await import('../indexing-block.js');
const { INDEXING_DRAINED, INDEXING_PORT, INDEXING_STOP_OP } = await import('../indexing-port.js');
const { pushToWorker } = await import('../channel.js');
import type { SummariseDocResult } from '../../../analyze/summariser/index.js';
import type { Entity } from '../../../shared/types.js';
import { stopWorker } from './helpers/stop-worker.js';

const SECTIONS = 25;
const FIXTURE = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-summary-fixture-')));
/** The threaded daemon's copy of the fixture, and the single-thread baseline's copy. */
const THREADED = join(FIXTURE, 'threaded');
const BASELINE = join(FIXTURE, 'baseline');
const services = new ThreadServices(() => ({ startedAt: 0, modelState: { status: 'ready' }, installedCommit: '' }));
const router = new Router({ classOf: methodClasses.classOf, registry: services.registry, routed: new Set(['indexing']), local: directDispatch({}) });
const block = new IndexingBlock(services.indexingBlock);
let codeWorker: Worker;
let summaryWorker: Worker;
let codePort: MessagePort;
/** What the summary worker summarised, in order, and whether code work was queued at that moment. */
const summarised: { id: string; codeBusy: boolean }[] = [];

function writeFixture(dir: string): void {
	mkdirSync(join(dir, 'docs'), { recursive: true });
	mkdirSync(join(dir, 'src'), { recursive: true });
	for (let i = 0; i < SECTIONS; i++) {
		writeFileSync(join(dir, 'docs', `d${String(i).padStart(2, '0')}.md`), `# Document ${i}\n\nParagraph ${i} about the fixture, long enough to be a document of its own.\n`);
	}
	writeFileSync(join(dir, 'src', 'a.ts'), 'export function alpha(): number { return 1; }\n');
}
const nameOf = async (id: string): Promise<string> => (await getEntity(await getDb(), id))?.name ?? id;
/** The document entities the threaded copy's sweep summarises. */
async function docCount(root: string): Promise<number> {
	const { findEntitiesByFile } = await import('../../../db/entities.js');
	let n = 0;
	for (let i = 0; i < SECTIONS; i++) {
		n += (await findEntitiesByFile(await getDb(), join(root, 'docs', `d${String(i).padStart(2, '0')}.md`))).filter(e => e.kind === 'document' || e.kind === 'section').length;
	}
	return n;
}
async function until(cond: () => boolean | Promise<boolean>, what: string, ms = 30_000): Promise<void> {
	const deadline = Date.now() + ms;
	while (!(await cond())) {
		if (Date.now() > deadline) assert.fail(`timed out waiting for: ${what}`);
		await new Promise(r => setTimeout(r, 25));
	}
}

before(async () => {
	declareLiveStoreOwner();
	const db = await getDb();
	await initDb(db);
	writeFixture(THREADED);
	cpSync(THREADED, BASELINE, { recursive: true });
	await addRepo(db, { path: THREADED, name: 'threaded', addedAt: new Date().toISOString(), status: 'pending' });

	const channel = new MessageChannel();
	const summary = await startWorker(services, 'document-summary', 'summary-worker', { workerData: { summaryPort: channel.port2 }, transferList: [channel.port2] });
	summaryWorker = summary.worker;
	summaryWorker.on('message', (m: { summarised?: string; codeBusy?: boolean }) => {
		if (m.summarised !== undefined) summarised.push({ id: m.summarised, codeBusy: m.codeBusy === true });
	});
	const code = await startClassWorker(services, router, 'indexing', 'indexing-worker', { workerData: { summaryPort: channel.port1 }, transferList: [channel.port1] });
	codeWorker = code.worker;
	codePort = code.port;
});
after(async () => {
	try { await stopWorker(codeWorker, () => pushToWorker(codePort, INDEXING_STOP_OP, null), INDEXING_DRAINED); }
	finally { await summaryWorker.terminate(); }
	await closeLanceConn();
	await closeGraphStore();
	for (const d of [HOME, FIXTURE]) rmSync(d, { recursive: true, force: true });
});

test("with the queue's two lanes on two threads, a summary starts only while the index lane is idle, and the order of jobs and the indexed and summarised results equal the single-thread queue for the same input", async () => {
	// Code work arrives while the sweep runs: the summary lane yields to it.
	await until(() => summarised.length >= 3, 'the sweep to start');
	for (let i = 0; i < 5; i++) {
		writeFileSync(join(THREADED, 'src', `late${i}.ts`), `export const late${i} = ${i};\n`);
		await router.request('indexing', INDEXING_PORT.enqueue, { kind: 'file', filePath: join(THREADED, 'src', `late${i}.ts`), event: 'create' });
		await new Promise(r => setTimeout(r, 30));
	}
	const docs = await docCount(THREADED);
	assert.ok(docs >= SECTIONS, `the fixture has ${docs} document entities`);
	await until(() => summarised.length >= docs && services.board.snapshot().indexing.idle, 'the sweep to finish');
	assert.deepEqual(summarised.filter(s => s.codeBusy), [], 'no summary started while code work was queued');
	const threadedOrder = await Promise.all(summarised.map(s => nameOf(s.id)));

	// The single-thread queue over the baseline copy of the same input.
	const db = await getDb();
	await addRepo(db, { path: BASELINE, name: 'baseline', addedAt: new Date().toISOString(), status: 'pending' });
	const baselineOrder: string[] = [];
	class Stub extends IndexerService {
		protected override async summariseEntity(entity: Entity): Promise<SummariseDocResult> { baselineOrder.push(entity.name); return { ok: true }; }
	}
	const queue = new IndexQueue();
	const indexer = new Stub(db, queue, new Watcher(), undefined);
	const running = queue.start(job => indexer.processJob(job));
	queue.enqueue({ kind: 'full', repoPath: BASELINE });
	await until(() => baselineOrder.length >= docs && !queue.isProcessing && queue.depth === 0, 'the baseline sweep');
	queue.stop();
	await running;
	assert.deepEqual(threadedOrder, baselineOrder, 'the same documents summarised in the same order');

	// The indexed results are the same, apart from the late files added to the threaded copy.
	const { findEntitiesByFile } = await import('../../../db/entities.js');
	for (const f of ['docs/d00.md', 'docs/d24.md', 'src/a.ts']) {
		const shape = async (root: string): Promise<string[]> => (await findEntitiesByFile(db, join(root, f))).map(e => `${e.kind}:${e.name.replace(root, '<root>')}`).sort();
		assert.deepEqual(await shape(THREADED), await shape(BASELINE), f);
	}
});

test("waitForIndexIdle on the summary worker reflects the code-indexing worker's real state", async () => {
	await until(() => services.board.snapshot().indexing.idle, 'idle');
	assert.equal(block.codeBusy, false);
	let waited = false;
	await router.request('indexing', INDEXING_PORT.enqueue, { kind: 'full', repoPath: THREADED });
	assert.equal(block.codeBusy, true, 'the code-indexing worker marked code work before answering the enqueue');
	const idle = block.waitForCodeIdle().then(() => { waited = true; });
	assert.equal(waited, false);
	await idle;
	assert.equal(block.codeBusy, false);
	assert.equal(services.board.snapshot().indexing.index.depth, 0);
	await until(() => services.board.snapshot().indexing.idle, 'the follow-up sweep to finish');
});

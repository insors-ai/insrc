/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Two threads of one process on the same Lance table at once (Epic 86197ac6,
 * Story s2, t17): a worker adds vectors while this thread searches them, as the
 * code-indexing worker and the main thread do in a threaded daemon. With
 * @lancedb/lancedb 0.27.2 this killed the whole process (SIGSEGV, or V8's
 * "Handle not reset in first callback") within a few hundred searches; the
 * library is pinned at a release where it does not. If it regresses, this file's
 * process dies and the file fails. Since s3 several session workers search while the
 * indexing worker writes: the second test runs three searching workers and this
 * thread against writers that write the whole time.
 *
 * Run: npx tsx --test src/db/lance/__tests__/lance-cross-thread.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import { loadLocalProviderConfig } from '../../../config/local.js';
import { closeLanceConn, setLanceConnPath } from '../conn.js';
import { _resetEntityVecCache, addEntityEmbeddings, searchEntityVecs } from '../entity-vec.js';

test('a worker adding vectors while another thread searches the same table: both finish and the process lives', { timeout: 300_000 }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-lance-xthread-'));
	const path = join(dir, 'lance');
	const dim = loadLocalProviderConfig().embeddingDim;
	setLanceConnPath(path);
	let writing = true;
	let searching: Promise<void> = Promise.resolve();
	let worker: Worker | undefined;
	try {
		await addEntityEmbeddings([{ id: 'seed'.padEnd(32, 'x'), embedding: Array.from({ length: dim }, () => 0.1), repo: '/r', kind: 'function', artifact: false }]);
		let searches = 0;
		searching = (async () => {
			while (writing) {
				await searchEntityVecs(Array.from({ length: dim }, (_, k) => Math.cos(k + searches)), ['/r'], 20);
				searches++;
			}
		})();
		for (let round = 0; round < 2; round++) {
			worker = new Worker(new URL('./helpers/cross-thread-writer.ts', import.meta.url), {
				workerData: { path, dim, batches: 300 }, execArgv: ['--import', 'tsx/esm'],
			});
			const w = worker;
			const done = await new Promise<unknown>((resolve, reject) => { w.once('message', resolve); w.once('error', reject); });
			assert.equal(done, 'done');
			await new Promise(r => w.once('exit', r));
			worker = undefined;
		}
		writing = false;
		await searching;
		assert.ok(searches > 50, `the searches ran alongside the writes (${searches})`);
		const hits = await searchEntityVecs(Array.from({ length: dim }, (_, k) => Math.sin(k)), ['/r'], 5);
		assert.equal(hits.length, 5, 'every write is readable afterwards');
	} finally {
		// Whatever failed: stop the search loop and any writer before the store goes away.
		writing = false;
		await searching.catch(() => {});
		if (worker !== undefined) await worker.terminate();
		await closeLanceConn();
		_resetEntityVecCache();
		rmSync(dir, { recursive: true, force: true });
	}
});

test('several worker threads and this one searching while writer workers write the whole time: all finish and the process lives', { timeout: 300_000 }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-lance-xthread-many-'));
	const path = join(dir, 'lance');
	const dim = loadLocalProviderConfig().embeddingDim;
	// This thread's table handle still points at the first test's store.
	_resetEntityVecCache();
	setLanceConnPath(path);
	const searchers: Worker[] = [];
	let writer: Worker | undefined;
	let writing = true;
	let searching: Promise<void> = Promise.resolve();
	try {
		await addEntityEmbeddings([{ id: 'seed'.padEnd(32, 'x'), embedding: Array.from({ length: dim }, () => 0.1), repo: '/r', kind: 'function', artifact: false }]);
		for (let i = 0; i < 3; i++) {
			searchers.push(new Worker(new URL('./helpers/cross-thread-searcher.ts', import.meta.url), {
				workerData: { path, dim, seed: i * 1000 }, execArgv: ['--import', 'tsx/esm'],
			}));
		}
		const counts = searchers.map(w => new Promise<number>((resolve, reject) => { w.once('message', resolve); w.once('error', reject); }));
		let mine = 0;
		searching = (async () => {
			while (writing) { await searchEntityVecs(Array.from({ length: dim }, (_, k) => Math.sin(k + mine)), ['/r'], 20); mine++; }
		})();
		// Writers back to back for the whole window, so every search runs against a table being written.
		const until = Date.now() + 20_000;
		let rounds = 0;
		while (Date.now() < until) {
			writer = new Worker(new URL('./helpers/cross-thread-writer.ts', import.meta.url), {
				workerData: { path, dim, batches: 60 }, execArgv: ['--import', 'tsx/esm'],
			});
			const w = writer;
			assert.equal(await new Promise<unknown>((resolve, reject) => { w.once('message', resolve); w.once('error', reject); }), 'done');
			await new Promise(r => w.once('exit', r));
			writer = undefined;
			rounds++;
		}
		for (const w of searchers) w.postMessage('stop');
		const done = await Promise.all(counts);
		writing = false;
		await searching;
		assert.ok(rounds >= 2, `writers wrote throughout (${rounds} rounds)`);
		for (const [i, n] of done.entries()) assert.ok(n > 20, `searching worker ${i} ran alongside the writes (${n} searches)`);
		assert.ok(mine > 20, `this thread ran alongside the writes (${mine} searches)`);
	} finally {
		writing = false;
		await searching.catch(() => {});
		for (const w of searchers) await w.terminate();
		if (writer !== undefined) await writer.terminate();
		await closeLanceConn();
		_resetEntityVecCache();
		rmSync(dir, { recursive: true, force: true });
	}
});

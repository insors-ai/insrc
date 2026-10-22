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
 * process dies and the file fails.
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
import { addEntityEmbeddings, searchEntityVecs } from '../entity-vec.js';

test('a worker adding vectors while another thread searches the same table: both finish and the process lives', { timeout: 300_000 }, async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-lance-xthread-'));
	const path = join(dir, 'lance');
	const dim = loadLocalProviderConfig().embeddingDim;
	setLanceConnPath(path);
	try {
		await addEntityEmbeddings([{ id: 'seed'.padEnd(32, 'x'), embedding: Array.from({ length: dim }, () => 0.1), repo: '/r', kind: 'function', artifact: false }]);
		let searches = 0;
		let writing = true;
		const searching = (async () => {
			while (writing) {
				await searchEntityVecs(Array.from({ length: dim }, (_, k) => Math.cos(k + searches)), ['/r'], 20);
				searches++;
			}
		})();
		for (let round = 0; round < 2; round++) {
			const worker = new Worker(new URL('./helpers/cross-thread-writer.ts', import.meta.url), {
				workerData: { path, dim, batches: 300 }, execArgv: ['--import', 'tsx/esm'],
			});
			const done = await new Promise<unknown>((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
			assert.equal(done, 'done');
			await new Promise(r => worker.once('exit', r));
		}
		writing = false;
		await searching;
		assert.ok(searches > 50, `the searches ran alongside the writes (${searches})`);
		const hits = await searchEntityVecs(Array.from({ length: dim }, (_, k) => Math.sin(k)), ['/r'], 5);
		assert.equal(hits.length, 5, 'every write is readable afterwards');
	} finally {
		await closeLanceConn();
		rmSync(dir, { recursive: true, force: true });
	}
});

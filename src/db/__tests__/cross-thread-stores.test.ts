/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Lance and DuckDB from several daemon threads (Epic 86197ac6, Story s1, t6):
 * Lance reads see other threads' writes, and DuckDB queries from different
 * threads take the one permit in turn.
 *
 * Run: npx tsx --test src/db/__tests__/cross-thread-stores.test.ts
 */

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { closeLanceConn, getLanceConn, setLanceConnPath } from '../lance/conn.js';
import { createStoreGuardBlock } from '../store-guard.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const base = mkdtempSync(join(tmpdir(), 'insrc-cross-thread-stores-'));
after(async () => { await closeLanceConn(); rmSync(base, { recursive: true, force: true }); });

function messages(worker: Worker): () => Promise<Record<string, unknown>> {
	const inbox: Record<string, unknown>[] = [];
	const waiting: ((m: Record<string, unknown>) => void)[] = [];
	worker.on('message', (m: Record<string, unknown>) => { const w = waiting.shift(); if (w !== undefined) w(m); else inbox.push(m); });
	return () => { const m = inbox.shift(); return m !== undefined ? Promise.resolve(m) : new Promise(res => { waiting.push(res); }); };
}

test('a Lance write in one thread is read from another with readConsistencyInterval 0 and missed with it unset', async () => {
	const path = join(base, 'lance');
	setLanceConnPath(path);
	const table = await (await getLanceConn()).createTable('t', [{ id: 1 }]);

	const worker = new Worker(join(HERE, 'helpers', 'lance-reader-worker.ts'), { workerData: { path } });
	const next = messages(worker);
	try {
		assert.equal((await next())['step'], 'opened', 'the worker opened the table before the write');
		await table.add([{ id: 2 }]);
		worker.postMessage('count');
		const counts = await next();
		assert.equal(counts['strong'], 2, 'the daemon\'s connection sees the other thread\'s write');
		assert.equal(counts['unset'], 1, 'a connection with the interval unset misses it, which is why 0 is required');
	} finally {
		await worker.terminate();
	}
});

test("two threads' DuckDB queries run one after the other behind the one permit and both succeed", async () => {
	const block = createStoreGuardBlock();
	const run = (value: number): Promise<Record<string, unknown>> => {
		const worker = new Worker(join(HERE, 'helpers', 'duckdb-query-worker.ts'), { workerData: { block, holdMs: 200, value } });
		const next = messages(worker);
		return next().finally(() => worker.terminate());
	};
	const results = await Promise.all([run(10), run(20)]);   // both threads start at once
	for (const r of results) assert.equal(r['ok'], true, `query succeeded: ${String(r['message'] ?? '')}`);
	assert.deepEqual(results.map(r => r['v']).sort(), [10, 20]);
	const [first, second] = [...results].sort((x, y) => (x['start'] as number) - (y['start'] as number));
	assert.ok((second!['start'] as number) >= (first!['end'] as number), `the second query started after the first ended (first ${String(first!['start'])}-${String(first!['end'])}, second ${String(second!['start'])})`);
});

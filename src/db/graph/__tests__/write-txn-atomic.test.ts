/**
 * ISSUE-5437d6e5, S001/t1 -- a withWriteTxn callback that throws leaves
 * nothing behind.
 *
 * lmdb's plain transaction() batches callers into one shared write
 * transaction and commits a throwing callback's writes; withWriteTxn runs
 * its callback as a child transaction, which is aborted on a throw while
 * its batch neighbours commit. Its callback must be synchronous.
 *
 * Run: npx tsx --test src/db/graph/__tests__/write-txn-atomic.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { closeGraphStore, getGraphStore, setGraphStorePath, withWriteTxn } from '../store.js';
import { useTemporaryLance } from '../../lance/__tests__/helpers/temp-lance.js';

useTemporaryLance();

let dir: string;

test.beforeEach(async () => {
	await closeGraphStore();
	dir = mkdtempSync(join(tmpdir(), 'insrc-write-txn-atomic-'));
	setGraphStorePath(join(dir, 'graph.lmdb'));
});
test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

const EDGE_KEY = Buffer.from('atomic-edge-key');

test('a withWriteTxn callback that writes in two sub-DBs and throws rejects with its own error and leaves nothing, in-process and after a reopen', async () => {
	const boom = new Error('boom');
	await assert.rejects(
		withWriteTxn(s => {
			void s.meta.put('atomic-meta', 'v');
			void s.outEdge.put(EDGE_KEY, Buffer.alloc(0));
			throw boom;
		}),
		(e: unknown) => e === boom,
	);
	let store = await getGraphStore();
	assert.equal(store.meta.get('atomic-meta'), undefined);
	assert.equal(store.outEdge.get(EDGE_KEY), undefined);

	await closeGraphStore();
	store = await getGraphStore();
	assert.equal(store.meta.get('atomic-meta'), undefined, 'not kept after a reopen');
	assert.equal(store.outEdge.get(EDGE_KEY), undefined, 'not kept after a reopen');

	// A callback that returns commits as before, and its result comes back.
	assert.equal(await withWriteTxn(s => { void s.meta.put('atomic-ok', 'v'); return 7; }), 7);
	assert.equal(store.meta.get('atomic-ok'), 'v');
});

test('of two callers queued together, one throwing and one succeeding, only the successful one\'s writes are kept', async () => {
	await getGraphStore();
	const failing = withWriteTxn(s => { void s.meta.put('neighbour-bad', 'v'); throw new Error('bad'); });
	const passing = withWriteTxn(s => { void s.meta.put('neighbour-good', 'v'); return 'good'; });
	const [f, p] = await Promise.allSettled([failing, passing]);
	assert.equal(f.status, 'rejected');
	assert.deepEqual(p, { status: 'fulfilled', value: 'good' });

	await closeGraphStore();
	const store = await getGraphStore();
	assert.equal(store.meta.get('neighbour-bad'), undefined);
	assert.equal(store.meta.get('neighbour-good'), 'v');
});

test('an async callback is refused with "withWriteTxn callbacks must be synchronous" and keeps nothing; the type rejects it', async () => {
	await assert.rejects(
		// @ts-expect-error -- a Promise-returning callback does not type-check
		withWriteTxn(async s => { void s.meta.put('async-prefix', 'v'); return 1; }),
		/withWriteTxn callbacks must be synchronous/,
	);
	await closeGraphStore();
	const store = await getGraphStore();
	assert.equal(store.meta.get('async-prefix'), undefined, 'the write made before the Promise was returned is not kept');
});

test('a refused async callback that rejects later raises no unhandled rejection', async () => {
	const unhandled: unknown[] = [];
	const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
	process.on('unhandledRejection', onUnhandled);
	try {
		await assert.rejects(
			// @ts-expect-error -- a Promise-returning callback does not type-check
			withWriteTxn(async () => { await new Promise(r => setTimeout(r, 5)); throw new Error('late'); }),
			/withWriteTxn callbacks must be synchronous/,
		);
		await new Promise(r => setTimeout(r, 50));   // past the callback's own rejection
		assert.deepEqual(unhandled, []);
	} finally {
		process.off('unhandledRejection', onUnhandled);
	}
});

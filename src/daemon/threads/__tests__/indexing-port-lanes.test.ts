/**
 * Epic c2ba6fa6 s2 review -- the main thread's indexing port reports the
 * backfill lane the code-indexing worker publishes, beside the index and
 * summary lanes, and leaves it out when the board has none.
 *
 * Run: npx tsx --test src/daemon/threads/__tests__/indexing-port-lanes.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { IndexingPortClient } from '../indexing-port.js';

type Board = ConstructorParameters<typeof IndexingPortClient>[1];
const boardWith = (indexing: object): Board => ({ snapshot: () => ({ indexing }) }) as unknown as Board;
const noRequest = async (): Promise<unknown> => { throw new Error('no request expected'); };

test('laneStatus carries the published backfill lane; depth and isProcessing count it', () => {
	const port = new IndexingPortClient(noRequest, boardWith({
		index: { depth: 1, processing: false }, summary: { depth: 0, processing: false }, backfill: { depth: 2, processing: true },
	}));
	assert.deepEqual(port.laneStatus(), {
		index: { depth: 1, running: false }, summary: { depth: 0, running: false }, backfill: { depth: 2, running: true },
	});
	assert.equal(port.depth, 3);
	assert.equal(port.isProcessing, true);
});

test('a board with no backfill lane gives a laneStatus without one', () => {
	const port = new IndexingPortClient(noRequest, boardWith({ index: { depth: 0, processing: false }, summary: { depth: 0, processing: false } }));
	assert.equal('backfill' in port.laneStatus(), false);
});

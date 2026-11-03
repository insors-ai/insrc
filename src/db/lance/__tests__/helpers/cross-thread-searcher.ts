/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for lance-cross-thread.test.ts: searches the table at the path it was given until
// the parent says stop, as a session worker does while the indexing worker writes; then
// posts how many searches it ran.
import { parentPort, workerData } from 'node:worker_threads';

import { setLanceConnPath } from '../../conn.js';
import { searchEntityVecs } from '../../entity-vec.js';

const { path, dim, seed } = workerData as { path: string; dim: number; seed: number };
setLanceConnPath(path);
let stop = false;
parentPort!.once('message', () => { stop = true; });
let searches = 0;
while (!stop) {
	await searchEntityVecs(Array.from({ length: dim }, (_, k) => Math.cos(seed + k + searches)), ['/r'], 20);
	searches++;
	// Garbage-collection pressure on the searching side too.
	if (searches % 25 === 0) { const junk = Array.from({ length: 100_000 }, (_, i) => ({ i, s: 'y'.repeat(20) })); void junk; }
}
parentPort!.postMessage(searches);

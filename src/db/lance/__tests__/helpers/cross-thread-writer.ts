/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for lance-cross-thread.test.ts: adds entity vectors to the table at
// the path it was given, batch after batch, while the parent thread searches it.
import { parentPort, workerData } from 'node:worker_threads';

import { setLanceConnPath } from '../../conn.js';
import { addEntityEmbeddings } from '../../entity-vec.js';

const { path, dim, batches } = workerData as { path: string; dim: number; batches: number };
setLanceConnPath(path);
for (let b = 0; b < batches; b++) {
	await addEntityEmbeddings(Array.from({ length: 20 }, (_, i) => ({
		id: `${b}-${i}`.padEnd(32, 'x'), embedding: Array.from({ length: dim }, (_, k) => Math.sin(b + i + k)),
		repo: '/r', kind: 'function', artifact: false,
	})));
	// Garbage-collection pressure, as a busy indexing worker makes: the crash was in a GC callback.
	if (b % 20 === 0) { const junk = Array.from({ length: 200_000 }, (_, i) => ({ i, s: 'x'.repeat(20) })); void junk; }
}
parentPort!.postMessage('done');

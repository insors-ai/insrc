/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for cross-thread-stores.test.ts: opens one table twice, through the
// daemon's connection (readConsistencyInterval 0) and through a connection with
// the interval unset, before the main thread writes; then counts rows in both.
import { parentPort, workerData } from 'node:worker_threads';
import * as lancedb from '@lancedb/lancedb';

import { getLanceConn, setLanceConnPath } from '../../lance/conn.js';

const { path } = workerData as { path: string };
setLanceConnPath(path);
const strong = await (await getLanceConn()).openTable('t');
const unset = await (await lancedb.connect(path)).openTable('t');
parentPort!.postMessage({ step: 'opened' });
parentPort!.on('message', async (m: string) => {
	if (m === 'count') parentPort!.postMessage({ step: 'count', strong: await strong.countRows(), unset: await unset.countRows() });
});

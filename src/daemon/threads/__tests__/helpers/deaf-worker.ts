/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for maintenance.test.ts: a daemon worker that holds the graph store
// open and never acknowledges graph.close.
import { parentPort, workerData } from 'node:worker_threads';

import { getGraphStore } from '../../../../db/graph/store.js';
import type { WorkerConnection } from '../../main-services.js';
import { GRAPH_CLOSE_OP, startDaemonWorker } from '../../worker-entry.js';

const hub = startDaemonWorker(workerData as WorkerConnection['workerData']);
await getGraphStore();
hub.onPush(GRAPH_CLOSE_OP, () => { /* never closes, never answers */ });
parentPort!.postMessage('worker-ready');

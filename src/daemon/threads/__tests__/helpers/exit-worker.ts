/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for supervisor.test.ts: a daemon worker that becomes ready and then
// exits with code 1, as a worker that keeps crashing.
import { parentPort, workerData } from 'node:worker_threads';

import type { WorkerConnection } from '../../main-services.js';
import { startDaemonWorker } from '../../worker-entry.js';

startDaemonWorker(workerData as WorkerConnection['workerData']);
parentPort!.postMessage('worker-ready');
setTimeout(() => process.exit(1), 20);

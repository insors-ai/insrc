/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for supervisor.test.ts: on its first attempt it exits with code 1
// before it is ready (a failed first start); on a later attempt it becomes
// ready and stays up.
import { parentPort, workerData } from 'node:worker_threads';

import type { WorkerConnection } from '../../main-services.js';
import { startDaemonWorker } from '../../worker-entry.js';

const data = workerData as WorkerConnection['workerData'] & { attempt: number };
if (data.attempt === 1) process.exit(1);
startDaemonWorker(data);
parentPort!.postMessage('worker-ready');
setInterval(() => {}, 1 << 30);

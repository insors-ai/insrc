/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for store-health-threads.test.ts: shares the process's store guard
// block, meets a lock-loss read error, and reports the record it broadcast.
import { parentPort, workerData } from 'node:worker_threads';

import { installStoreGuard } from '../../../store-guard.js';
import { getStoreHealth, recordStoreFailureIfLockError, setStoreHealthBroadcaster } from '../../store.js';

installStoreGuard((workerData as { block: SharedArrayBuffer }).block);
let broadcast: unknown;
setStoreHealthBroadcaster(h => { broadcast = h; });
const recorded = recordStoreFailureIfLockError(Object.assign(new Error('MDB_LOCK_FAILURE: Failed to get robust semaphore'), { code: -30775 }), 'request worker.op');
parentPort!.postMessage({ recorded, broadcast, health: getStoreHealth() });

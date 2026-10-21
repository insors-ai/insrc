/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for store-health-threads.test.ts, wired to the main thread's hub.
// role 'finder' meets a lock-loss read error; role 'bystander' waits and, when
// asked, reports the health it holds.
import { parentPort, workerData } from 'node:worker_threads';
import type { MessagePort } from 'node:worker_threads';

import { HubClient } from '../../../../daemon/threads/channel.js';
import { wireWorkerStoreHealth } from '../../../../daemon/threads/store-health-hub.js';
import { installStoreGuard } from '../../../store-guard.js';
import { getStoreHealth, recordStoreFailureIfLockError } from '../../store.js';

const { block, port, role } = workerData as { block: SharedArrayBuffer; port: MessagePort; role: 'finder' | 'bystander' };
installStoreGuard(block);
wireWorkerStoreHealth(new HubClient(port));
parentPort!.on('message', (m: string) => {
	if (m === 'find') {
		recordStoreFailureIfLockError(Object.assign(new Error('MDB_LOCK_FAILURE: Failed to get robust semaphore'), { code: -30775 }), 'request finder.op');
		parentPort!.postMessage({ step: 'found' });
	}
	if (m === 'health') parentPort!.postMessage({ step: 'health', health: getStoreHealth() });
});
parentPort!.postMessage({ step: 'ready' });

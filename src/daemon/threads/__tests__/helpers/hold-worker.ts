/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for supervisor.test.ts: with workerData.hold, takes a named lock and a
// store-guard permit and keeps both, reports 'holding', and exits with code 1
// when its parent says 'exit' -- dying with both held.
import { parentPort, workerData } from 'node:worker_threads';

import { getStoreGuard } from '../../../../db/store-guard.js';
import { getLockManager } from '../../../../shared/locks/lock-manager.js';
import type { WorkerConnection } from '../../main-services.js';
import { startDaemonWorker } from '../../worker-entry.js';

const init = workerData as WorkerConnection['workerData'] & { readonly hold: boolean; readonly lockName: string };
startDaemonWorker(init);
const forever = new Promise<void>(() => {});
if (init.hold) {
	let held = 0;
	const holding = (): void => { if (++held === 2) parentPort!.postMessage('holding'); };
	void getLockManager().request(init.lockName, { mode: 'exclusive' }, () => { holding(); return forever; });
	void getStoreGuard().withStore('duckdb', () => { holding(); return forever; }, { acquireTimeoutMs: 5_000 });
	parentPort!.on('message', m => { if (m === 'exit') process.exit(1); });
}
parentPort!.postMessage('worker-ready');

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for lock-manager.test.ts: its only work is one waiting lock request,
// so it stays alive only if the wait keeps it alive. It reports the grant and
// then exits on its own.
import { parentPort, workerData } from 'node:worker_threads';

import { installLockManager } from '../../lock-manager.js';

const { block, name } = workerData as { block: SharedArrayBuffer; name: string };
const manager = installLockManager(block);
void manager.request(name, { timeoutMs: 10_000 }, lock => { parentPort!.postMessage({ granted: lock?.mode ?? null }); });

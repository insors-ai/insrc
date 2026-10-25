/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Worker for store-guard.test.ts: takes the duckdb permit from the shared block.
// mode 'hold' keeps it until the worker is terminated; mode 'take' takes it,
// reports, and releases.
import { parentPort, threadId, workerData } from 'node:worker_threads';

import { installStoreGuard } from '../../store-guard.js';

const { block, mode } = workerData as { block: SharedArrayBuffer; mode: 'hold' | 'take' };
const guard = installStoreGuard(block);

void guard.withStore('duckdb', async () => {
	parentPort!.postMessage({ step: 'acquired', threadId });
	if (mode === 'hold') await new Promise<never>(() => {});
}, { acquireTimeoutMs: 10_000 }).catch((e: unknown) => parentPort!.postMessage({ step: 'error', message: (e as Error).message }));
